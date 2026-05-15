import { state } from './state.js';

export function renderMetrics() {
  const totalEl = document.getElementById('metrics-total');
  const successEl = document.getElementById('metrics-success');
  const failureEl = document.getElementById('metrics-failure');
  const rateEl = document.getElementById('metrics-rate');
  const listEl = document.getElementById('metrics-history-list');

  if (!totalEl || !successEl || !failureEl || !rateEl || !listEl) return;

  const stats = state.stats;
  const total = stats.success + stats.failure;
  const rate = total > 0 ? Math.round((stats.success / total) * 100) : 0;

  totalEl.textContent = String(total);
  successEl.textContent = String(stats.success);
  failureEl.textContent = String(stats.failure);
  rateEl.textContent = `${rate}%`;

  listEl.innerHTML = '';

  if (!state.history || state.history.length === 0) {
    listEl.innerHTML = '<div class="stat-label" style="text-align: center; padding: 20px;">No hay historial disponible</div>';
    return;
  }

  state.history.forEach(item => {
    const row = document.createElement('div');
    row.className = 'history-item';

    const date = new Date(item.timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dateStr = isToday
      ? timeStr
      : date.toLocaleDateString([], { day: '2-digit', month: '2-digit' }) + ' ' + timeStr;

    // Use stored label first, fall back to current signal label, then signal ID
    const label = item.label || state.signals[item.signal]?.label || item.signal;
    const statusClass = item.success ? 'success' : 'failure';
    const statusText  = item.success ? 'Éxito' : 'Fallo';

    row.innerHTML = `
      <div class="hi-status ${statusClass}"></div>
      <div class="hi-info">
        <div class="hi-workflow">${label}</div>
        <div class="hi-time">${dateStr}</div>
      </div>
      <div class="hi-badge ${statusClass}">${statusText}</div>
    `;
    listEl.appendChild(row);
  });
}
