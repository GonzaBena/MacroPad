import { uiRegistry } from '../registry/ui-registry.js';
import { renderMetrics } from '../metrics.js';

export function registerCoreTabs() {
  uiRegistry.registerTab({
    id: 'monitor',
    label: 'Monitor',
    viewPath: 'views/monitor.html',
    containerId: 'tab-monitor'
  });

  uiRegistry.registerTab({
    id: 'workflows',
    label: 'Workflows',
    viewPath: 'views/workflows.html',
    containerId: 'tab-workflows'
  });

  uiRegistry.registerTab({
    id: 'metrics',
    label: 'Métricas',
    viewPath: 'views/metrics.html',
    containerId: 'tab-metrics',
    onActivate: () => {
      renderMetrics();
    }
  });
}
