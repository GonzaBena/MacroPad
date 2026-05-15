// ─── Draw colors ──────────────────────────────────────────────────────────────
const COL = {
  start:    '#00e5ff',
  normal:   '#7c7cff',
  goal:     '#00e676',
  kill:     '#ff3b5c',
  orbitArc: 'rgba(0,229,255,0.15)',
};

// ─── Game class ───────────────────────────────────────────────────────────────
class Game {
  constructor(levelIdx) {
    this.levelIdx = levelIdx;
    this.def      = LEVEL_DEFS[levelIdx];
    this.nodes    = this.def.nodes.map(n => ({
      x: n.x * W,
      y: n.y * H,
      type: n.type,
      r: 18,
      pulseT: Math.random() * Math.PI * 2,
    }));

    const sn = this.nodes[this.def.startNode];
    this.ball = { x: sn.x, y: sn.y, vx: 0, vy: 0, r: 7, trail: [] };

    // State machine: 'free' | 'orbiting'
    this.state        = 'free';
    this.attachedNode = null;
    this.orbitAngle   = 0;
    this.orbitRadius  = 0;
    this.orbitSpeed   = 0;       // rad/frame — sign encodes CW/CCW
    this.nextOrbitDir = 1;       // alternates when launched from rest

    this.LINEAR_SPEED    = 4.2;
    this.MIN_RADIUS      = 40;
    this.GOAL_GRAVITY_R  = 90;   // radio del campo gravitacional del goal
    this.GOAL_GRAVITY_STR = 280; // fuerza de atracción

    this.dead         = false;
    this.won          = false;
    this.nodesVisited = new Set([this.def.startNode]);

    this._onDown = this._onDown.bind(this);
    this._onUp   = this._onUp.bind(this);
    this._onSerialData = this._onSerialData.bind(this);

    canvas.addEventListener('mousedown',  this._onDown);
    canvas.addEventListener('mouseup',    this._onUp);
    canvas.addEventListener('touchstart', this._onDown, { passive: true });
    canvas.addEventListener('touchend',   this._onUp,   { passive: true });

    // Listen to hardware signals broadcasted by the main window
    window.parent.addEventListener('pokepad-serial-data', this._onSerialData);

    this.raf = requestAnimationFrame(this._loop.bind(this));
  }

  // ── Resize ─────────────────────────────────────────────────────────────────

  resize() {
    this.nodes.forEach((n, i) => {
      n.x = this.def.nodes[i].x * W;
      n.y = this.def.nodes[i].y * H;
    });
    if (this.state === 'orbiting') {
      const an = this.nodes[this.attachedNode];
      this.ball.x = an.x + Math.cos(this.orbitAngle) * this.orbitRadius;
      this.ball.y = an.y + Math.sin(this.orbitAngle) * this.orbitRadius;
    }
  }

  // ── Input ──────────────────────────────────────────────────────────────────

  _onSerialData(e) {
    const signal = e.detail;
    if (signal === 'BTN_DOWN') this._onDown();
    else if (signal === 'BTN_UP') this._onUp();
  }

  _onDown() {
    if (this.dead || this.won) return;
    document.getElementById('hint').style.opacity = '0';
    if (this.state === 'free') this._attachToNearest();
  }

  _onUp() {
    if (this.dead || this.won) return;
    if (this.state === 'orbiting') this._launch();
  }

  // ── Attach ─────────────────────────────────────────────────────────────────

  _attachToNearest() {
    let best = null, bestD = Infinity;
    this.nodes.forEach((n, i) => {
      const d = Math.hypot(this.ball.x - n.x, this.ball.y - n.y);
      if (d < bestD) { bestD = d; best = i; }
    });
    if (best === null) return;

    const n = this.nodes[best];
    if (n.type === 'kill') { this._die(); return; }
    // Goal can't be used as anchor — must be reached by collision in free flight
    if (n.type === 'goal') return;

    this.attachedNode = best;
    const rawR = Math.hypot(this.ball.x - n.x, this.ball.y - n.y);
    this.orbitRadius  = Math.max(rawR, this.MIN_RADIUS);
    this.orbitAngle   = Math.atan2(this.ball.y - n.y, this.ball.x - n.x);

    // Determine orbit direction from current velocity via cross product
    const rx = n.x - this.ball.x, ry = n.y - this.ball.y; // inward radial
    const speed = Math.hypot(this.ball.vx, this.ball.vy);
    let dir;
    if (speed < 0.5) {
      dir = this.nextOrbitDir;
      this.nextOrbitDir *= -1;
    } else {
      const cross = this.ball.vx * ry - this.ball.vy * rx;
      dir = cross > 0 ? 1 : -1;
    }

    this.orbitSpeed = dir * (this.LINEAR_SPEED / this.orbitRadius);
    this.state = 'orbiting';
    this.nodesVisited.add(best);
  }

  // ── Launch ─────────────────────────────────────────────────────────────────

  _launch() {
    // v = ω × r, tangent direction: (-sin θ, cos θ) × ω × r
    this.ball.vx = -Math.sin(this.orbitAngle) * this.orbitSpeed * this.orbitRadius;
    this.ball.vy =  Math.cos(this.orbitAngle) * this.orbitSpeed * this.orbitRadius;
    this.attachedNode = null;
    this.state = 'free';
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  _die() {
    if (this.dead) return;
    this.dead = true;
    totalTries++;
    setTimeout(() => {
      document.getElementById('dead-level').textContent = `NIVEL ${this.levelIdx + 1}`;
      document.getElementById('hud-tries').textContent  = totalTries;
      showOverlay('ov-dead');
    }, 400);
  }

  _win() {
    if (this.won) return;
    this.won = true;
    const isLast = this.levelIdx >= LEVEL_DEFS.length - 1;
    setTimeout(() => {
      document.getElementById('win-level').textContent = `NIVEL ${this.levelIdx + 1} COMPLETADO`;
      document.getElementById('win-msg').textContent   =
        `${this.nodesVisited.size} de ${this.nodes.length} nodos visitados`;
      document.getElementById('btn-next').textContent =
        isLast ? 'VER RESULTADOS' : 'SIGUIENTE NIVEL →';
      showOverlay('ov-win');
    }, 500);
  }

  // ── Loop ───────────────────────────────────────────────────────────────────

  _loop() {
    this.raf = requestAnimationFrame(this._loop.bind(this));
    this._update();
    this._draw();
    this._updateHUD();
  }

  _update() {
    if (this.dead || this.won) return;

    const ball = this.ball;

    if (this.state === 'orbiting') {
      // Orbital motion
      this.orbitAngle += this.orbitSpeed;
      const an = this.nodes[this.attachedNode];
      ball.x = an.x + Math.cos(this.orbitAngle) * this.orbitRadius;
      ball.y = an.y + Math.sin(this.orbitAngle) * this.orbitRadius;

    } else {
      // Free flight — apply goal gravity first, then move
      if (!this.dead && !this.won) {
        this.nodes.forEach(n => {
          if (n.type !== 'goal') return;
          const dx = n.x - ball.x;
          const dy = n.y - ball.y;
          const d  = Math.hypot(dx, dy);

          // Gravity well: pull toward goal within GOAL_GRAVITY_R
          if (d < this.GOAL_GRAVITY_R && d > 0.1) {
            // Force scales with 1/d² (capped so it doesn't explode at close range)
            const force = this.GOAL_GRAVITY_STR / Math.max(d * d, 200);
            ball.vx += (dx / d) * force;
            ball.vy += (dy / d) * force;
          }
        });
      }

      ball.x += ball.vx;
      ball.y += ball.vy;

      // Collision detection
      if (!this.dead && !this.won) {
        this.nodes.forEach(n => {
          const d = Math.hypot(ball.x - n.x, ball.y - n.y);
          if (d < n.r + ball.r) {
            if      (n.type === 'goal') this._win();
            else if (n.type === 'kill') this._die();
          }
        });
      }

      // Out of bounds
      if (ball.x < -80 || ball.x > W + 80 || ball.y < -80 || ball.y > H + 80) {
        this._die();
      }
    }

    // Trail
    ball.trail.push({ x: ball.x, y: ball.y });
    if (ball.trail.length > 28) ball.trail.shift();

    // Pulse nodes
    this.nodes.forEach(n => n.pulseT += 0.04);
  }

  // ── Draw ───────────────────────────────────────────────────────────────────

  _draw() {
    ctx.clearRect(0, 0, W, H);
    this._drawGrid();
    this._drawConnectors();
    this._drawOrbit();
    this._drawNodes();
    this._drawTrail();
    this._drawBall();
  }

  _drawGrid() {
    ctx.strokeStyle = 'rgba(255,255,255,0.025)';
    ctx.lineWidth   = 1;
    const gs = 48;
    for (let x = 0; x < W; x += gs) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += gs) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
  }

  _drawConnectors() {
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth   = 1;
    ctx.setLineDash([4, 8]);
    for (let i = 0; i < this.nodes.length - 1; i++) {
      ctx.beginPath();
      ctx.moveTo(this.nodes[i].x,     this.nodes[i].y);
      ctx.lineTo(this.nodes[i + 1].x, this.nodes[i + 1].y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  _drawOrbit() {
    if (this.state !== 'orbiting') return;
    const an = this.nodes[this.attachedNode];

    // Dashed orbit circle
    ctx.strokeStyle = COL.orbitArc;
    ctx.lineWidth   = 1;
    ctx.setLineDash([3, 7]);
    ctx.beginPath();
    ctx.arc(an.x, an.y, this.orbitRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Rope
    ctx.strokeStyle = 'rgba(0,229,255,0.55)';
    ctx.lineWidth   = 1.5;
    ctx.lineCap     = 'round';
    ctx.beginPath();
    ctx.moveTo(an.x, an.y);
    ctx.lineTo(this.ball.x, this.ball.y);
    ctx.stroke();
    ctx.lineCap = 'butt';
  }

  _drawNodes() {
    this.nodes.forEach((n, i) => {
      const pulse      = Math.sin(n.pulseT) * 0.25 + 0.75;
      const col        = COL[n.type] || COL.normal;
      const isAttached = i === this.attachedNode;

      // Gravity well rings for goal nodes
      if (n.type === 'goal') {
        const rings = 3;
        for (let r = 0; r < rings; r++) {
          const phase  = (n.pulseT * 0.6 + r * (Math.PI * 2 / rings)) % (Math.PI * 2);
          const expand = (Math.sin(phase) * 0.5 + 0.5); // 0..1
          const radius = n.r * 1.4 + expand * (this.GOAL_GRAVITY_R - n.r * 1.4);
          const alpha  = (1 - expand) * 0.25;
          ctx.strokeStyle = `rgba(0,230,118,${alpha})`;
          ctx.lineWidth   = 1;
          ctx.beginPath();
          ctx.arc(n.x, n.y, radius, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // Outer glow
      const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r * 3.5 * pulse);
      grad.addColorStop(0, col.replace(')', ', 0.35)').replace('rgb', 'rgba'));
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r * 3.5 * pulse, 0, Math.PI * 2);
      ctx.fill();

      // Visited ring
      if (this.nodesVisited.has(i) && n.type !== 'goal' && n.type !== 'kill') {
        ctx.strokeStyle = col;
        ctx.globalAlpha = 0.3;
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r + 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Core fill
      ctx.fillStyle   = isAttached ? '#fff' : col;
      ctx.globalAlpha = isAttached ? 1 : 0.9;
      ctx.beginPath();
      ctx.arc(n.x, n.y, isAttached ? n.r * 0.7 : n.r * 0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      // Outer ring
      ctx.strokeStyle = col;
      ctx.lineWidth   = isAttached ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.stroke();

      // Labels
      if (n.type === 'goal') {
        ctx.fillStyle    = COL.goal;
        ctx.font         = `${n.r}px Arial`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('★', n.x, n.y);
      }
      if (n.type === 'kill') {
        ctx.fillStyle    = COL.kill;
        ctx.font         = `bold ${n.r * 0.85}px Arial`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('✕', n.x, n.y);
      }
    });
  }

  _drawTrail() {
    const trail = this.ball.trail;
    for (let i = 1; i < trail.length; i++) {
      const t = i / trail.length;
      ctx.strokeStyle = `rgba(255,255,255,${t * 0.3})`;
      ctx.lineWidth   = t * this.ball.r * 1.4;
      ctx.lineCap     = 'round';
      ctx.beginPath();
      ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
      ctx.lineTo(trail[i].x,     trail[i].y);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
  }

  _drawBall() {
    const { x: bx, y: by, r: br } = this.ball;

    // Glow
    const glow = ctx.createRadialGradient(bx, by, 0, bx, by, br * 3);
    glow.addColorStop(0, 'rgba(255,255,255,0.4)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(bx, by, br * 3, 0, Math.PI * 2);
    ctx.fill();

    // Core
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, Math.PI * 2);
    ctx.fill();

    // Direction arc while orbiting
    if (this.state === 'orbiting') {
      ctx.strokeStyle = 'rgba(0,229,255,0.7)';
      ctx.lineWidth   = 2;
      ctx.beginPath();
      ctx.arc(bx, by, br + 5, this.orbitAngle - 0.6, this.orbitAngle + 0.6);
      ctx.stroke();
    }
  }

  _updateHUD() {
    document.getElementById('hud-level').textContent = this.levelIdx + 1;
    document.getElementById('hud-nodes').textContent =
      `${this.nodesVisited.size}/${this.nodes.length}`;
  }

  // ── Cleanup ────────────────────────────────────────────────────────────────

  destroy() {
    cancelAnimationFrame(this.raf);
    canvas.removeEventListener('mousedown',  this._onDown);
    canvas.removeEventListener('mouseup',    this._onUp);
    canvas.removeEventListener('touchstart', this._onDown);
    canvas.removeEventListener('touchend',   this._onUp);
    window.parent.removeEventListener('pokepad-serial-data', this._onSerialData);
  }
}
