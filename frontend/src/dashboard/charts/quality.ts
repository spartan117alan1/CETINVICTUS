import { classify } from '../../lib/quality.js'
import { bus, meta, selectedNode } from '../state.js'
import { make } from './common.js'
import type { ChartConfiguration } from 'chart.js'

const chart = make('graficaCalidad', {
  type: 'pie',
  data: {
    labels: ['Conforme', 'Fuera de rango', 'Dato no confiable'],
    datasets: [{ data: [0, 0, 0], backgroundColor: ['#198754', '#dc3545', '#ffc107'], borderColor: '#fff', borderWidth: 2 }],
  },
  options: {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom' },
      tooltip: {
        callbacks: {
          label: (c) => {
            const total = (c.dataset.data as number[]).reduce((a, b) => a + b, 0)
            const n = Number(c.raw)
            return ` ${c.label}: ${n} (${total ? Math.round((n / total) * 100) : 0} %)`
          },
        },
      },
    },
  },
} as ChartConfiguration<'pie'>)

const update = () => {
  const node = selectedNode()
  if (!chart || !node) return
  const c = { ok: 0, out: 0, doubt: 0, none: 0 }
  for (const m of meta().catalog) if (m.group === 'metrics' && m.kind === 'number') c[classify(m, node, meta())]++
  chart.data.datasets[0]!.data = [c.ok, c.out, c.doubt]
  chart.update('none')
}

export const initQuality = () => { bus.select.on(update); bus.live.on(update) }