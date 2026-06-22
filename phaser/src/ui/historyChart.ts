import type { Empire } from '../core/models/types';
import type { TickSnapshot } from '../core/galaxy/galaxyData';
import { getDisplayColor } from './displayColor';

export type MetricKey = 'planets' | 'networth' | 'buildings' | 'military';

const METRIC_LABELS: Record<MetricKey, string> = {
  planets: 'Planets',
  networth: 'Networth',
  buildings: 'Buildings',
  military: 'Military',
};

const ALL_METRICS: MetricKey[] = ['planets', 'networth', 'buildings', 'military'];

const PADDING = { top: 24, right: 16, bottom: 32, left: 52 };

export function createHistoryChart(
  snapshots: TickSnapshot[],
  empires: Empire[],
  localEmpireId: number,
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'history-chart-container';

  const title = document.createElement('h3');
  title.textContent = 'Game History';
  title.style.margin = '0 0 8px';
  container.append(title);

  // Metric toggle buttons
  const btnRow = document.createElement('div');
  btnRow.className = 'history-chart-buttons';
  container.append(btnRow);

  let activeMetric: MetricKey = 'networth';

  const canvas = document.createElement('canvas');
  canvas.className = 'history-chart-canvas';
  canvas.width = 560;
  canvas.height = 260;
  container.append(canvas);

  // Legend
  const legend = document.createElement('div');
  legend.className = 'history-chart-legend';
  for (const empire of empires) {
    const item = document.createElement('span');
    item.className = 'history-chart-legend-item';
    const swatch = document.createElement('span');
    swatch.className = 'history-chart-swatch';
    swatch.style.background = getDisplayColor(empire, localEmpireId);
    const label = document.createElement('span');
    label.textContent = empire.empireName;
    item.append(swatch, label);
    legend.append(item);
  }
  container.append(legend);

  function renderButtons(): void {
    btnRow.innerHTML = '';
    for (const key of ALL_METRICS) {
      const btn = document.createElement('button');
      btn.className = 'history-chart-btn' + (key === activeMetric ? ' active' : '');
      btn.textContent = METRIC_LABELS[key];
      btn.addEventListener('click', () => {
        activeMetric = key;
        renderButtons();
        draw();
      });
      btnRow.append(btn);
    }
  }

  function draw(): void {
    const ctx = canvas.getContext('2d');
    if (!ctx || snapshots.length === 0) return;

    // HiDPI support
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 560;
    const cssH = canvas.clientHeight || 260;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const w = cssW;
    const h = cssH;

    ctx.clearRect(0, 0, w, h);

    const plotW = w - PADDING.left - PADDING.right;
    const plotH = h - PADDING.top - PADDING.bottom;

    // Gather data ranges
    const firstTick = snapshots[0].tick;
    const lastTick = snapshots[snapshots.length - 1].tick;
    const tickRange = Math.max(lastTick - firstTick, 1);

    let maxVal = 0;
    for (const snap of snapshots) {
      for (const es of snap.empires) {
        const val = es[activeMetric];
        if (val > maxVal) maxVal = val;
      }
    }
    maxVal = maxVal || 1;
    // Add 10% headroom
    maxVal = Math.ceil(maxVal * 1.1);

    // Draw grid lines and Y axis labels
    ctx.strokeStyle = 'rgba(130, 154, 196, 0.15)';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#8a9ab5';
    ctx.font = '10px Inter, system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    const gridLines = 5;
    for (let i = 0; i <= gridLines; i++) {
      const y = PADDING.top + plotH - (i / gridLines) * plotH;
      ctx.beginPath();
      ctx.moveTo(PADDING.left, y);
      ctx.lineTo(PADDING.left + plotW, y);
      ctx.stroke();

      const val = (i / gridLines) * maxVal;
      ctx.fillText(formatAxisValue(val), PADDING.left - 6, y);
    }

    // X axis labels
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const xLabels = Math.min(6, snapshots.length);
    for (let i = 0; i <= xLabels; i++) {
      const tick = firstTick + (i / xLabels) * tickRange;
      const x = PADDING.left + (i / xLabels) * plotW;
      ctx.fillText(String(Math.round(tick)), x, PADDING.top + plotH + 6);
    }

    // X axis title
    ctx.fillText('Tick', PADDING.left + plotW / 2, PADDING.top + plotH + 20);

    // Draw lines per empire
    for (const empire of empires) {
      const color = getDisplayColor(empire, localEmpireId);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.8;
      ctx.beginPath();

      let started = false;
      for (const snap of snapshots) {
        const es = snap.empires.find((e) => e.empireId === empire.id);
        if (!es) continue;

        const x = PADDING.left + ((snap.tick - firstTick) / tickRange) * plotW;
        const y = PADDING.top + plotH - (es[activeMetric] / maxVal) * plotH;

        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }
  }

  renderButtons();
  draw();

  // Redraw on resize
  const observer = new ResizeObserver(() => draw());
  observer.observe(canvas);

  return container;
}

function formatAxisValue(val: number): string {
  if (val >= 1_000_000) return (val / 1_000_000).toFixed(1) + 'M';
  if (val >= 1_000) return (val / 1_000).toFixed(1) + 'k';
  return String(Math.round(val));
}
