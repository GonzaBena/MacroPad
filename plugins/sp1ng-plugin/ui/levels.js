// ─── Level definitions ────────────────────────────────────────────────────────
// Coords are fractions [0-1] of the canvas size so they scale with any resolution.
// node types: 'start' | 'normal' | 'kill' | 'goal'

const LEVEL_DEFS = [
  // Level 1 — Tutorial, 3 nodos en línea
  {
    nodes: [
      { x:0.15, y:0.5,  type:'start'  },
      { x:0.5,  y:0.5,  type:'normal' },
      { x:0.85, y:0.5,  type:'goal'   },
    ],
    startNode: 0,
  },

  // Level 2 — Zigzag
  {
    nodes: [
      { x:0.15, y:0.7,  type:'start'  },
      { x:0.38, y:0.3,  type:'normal' },
      { x:0.62, y:0.7,  type:'normal' },
      { x:0.85, y:0.3,  type:'goal'   },
    ],
    startNode: 0,
  },

  // Level 3 — Obstáculo en el medio
  {
    nodes: [
      { x:0.12, y:0.5,  type:'start'  },
      { x:0.35, y:0.25, type:'normal' },
      { x:0.5,  y:0.5,  type:'kill'   },
      { x:0.65, y:0.75, type:'normal' },
      { x:0.88, y:0.5,  type:'goal'   },
    ],
    startNode: 0,
  },

  // Level 4 — Espiral
  {
    nodes: [
      { x:0.1,  y:0.5,  type:'start'  },
      { x:0.3,  y:0.2,  type:'normal' },
      { x:0.6,  y:0.15, type:'normal' },
      { x:0.8,  y:0.35, type:'normal' },
      { x:0.75, y:0.65, type:'normal' },
      { x:0.5,  y:0.8,  type:'normal' },
      { x:0.88, y:0.88, type:'goal'   },
    ],
    startNode: 0,
  },

  // Level 5 — Laberinto de kills
  {
    nodes: [
      { x:0.1,  y:0.5,  type:'start'  },
      { x:0.3,  y:0.5,  type:'kill'   },
      { x:0.3,  y:0.2,  type:'normal' },
      { x:0.5,  y:0.5,  type:'kill'   },
      { x:0.5,  y:0.8,  type:'normal' },
      { x:0.7,  y:0.5,  type:'kill'   },
      { x:0.7,  y:0.2,  type:'normal' },
      { x:0.9,  y:0.5,  type:'goal'   },
    ],
    startNode: 0,
  },
];
