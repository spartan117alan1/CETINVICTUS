import { api } from '../../lib/api.js'
import { $, el } from '../../lib/dom.js'
import { bus, meta, state } from '../state.js'
import { make } from './common.js'

interface Hist { lo: number; hi: number; counts: number[] }

const chart = make('graficaHistograma', {
  type: 'bar',
  data: { labels: [] as string[], datasets: [{ label: 'Lecturas', data: [] as number[], backgroundColor: '#0d6efd', barPercentage: 1, categoryPercentage: 1 }] },
  options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } },
})

const select = () => $<HTMLSelectElement>('#hist-metric')

const load = async () => {
  if (!chart || !state.selected) return
  const bins = 20
  const h = await api<Hist>(`/nodes/${state.selected}/histogram?metric=${select().value}&range=${state.range}&bins=${bins}`)
  const w = (h.hi - h.lo) / bins
  chart.data.labels = h.counts.map((_, i) => (h.lo + i * w).toFixed(2))
  chart.data.datasets[0]!.data = h.counts
  chart.update()
}

export const initHistogram = () => {
  for (const m of meta().catalog)
    if (m.group === 'metrics' && m.kind === 'number') { const o = el('option', '', m.label) as HTMLOptionElement; o.value = m.key; select().append(o) }
  select().addEventListener('change', () => void load())
  bus.select.on(() => void load())
  bus.range.on(() => void load())
}