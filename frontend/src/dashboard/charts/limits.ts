import { boundsFor } from '../../lib/quality.js'
import { bus, meta, selectedNode } from '../state.js'
import { make } from './common.js'

const chart = make('graficaBarras', {
  type: 'bar',
  data: { labels: [] as string[], datasets: [{ data: [] as number[], backgroundColor: [] as string[], borderRadius: 4 }] },
  options: {
    indexAxis: 'y', responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${Number(c.raw).toFixed(0)} % del límite` } } },
    scales: { x: { beginAtZero: true, suggestedMax: 120, title: { display: true, text: '% del límite máximo' } } },
  },
})

const update = () => {
  const node = selectedNode()
  if (!chart || !node) return
  const labels: string[] = [], data: number[] = [], colors: string[] = []
  for (const m of meta().catalog) {
    const v = node.metrics[m.key]
    const b = boundsFor(meta(), node.key, m.key)
    if (m.group !== 'metrics' || typeof v !== 'number' || b?.max_value == null) continue
    const pct = (v / b.max_value) * 100
    labels.push(m.label); data.push(pct); colors.push(pct > 100 ? '#dc3545' : pct > 80 ? '#ffc107' : '#198754')
  }
  chart.data.labels = labels
  chart.data.datasets[0]!.data = data
  chart.data.datasets[0]!.backgroundColor = colors
  chart.update('none')
}

export const initLimits = () => { bus.select.on(update); bus.live.on(update) }