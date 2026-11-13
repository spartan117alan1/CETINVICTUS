import { api } from '../../lib/api.js'
import { $ } from '../../lib/dom.js'
import type { SummaryRow } from '../../lib/types.js'
import { bus, meta, state } from '../state.js'
import { make } from './common.js'

const chart = make('graficaCumplimiento', {
  type: 'bar',
  data: { labels: [] as string[], datasets: [{ data: [] as number[], backgroundColor: '#005C53', borderRadius: 4 }] },
  options: {
    indexAxis: 'y', responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: { x: { min: 0, max: 100, title: { display: true, text: '% del tiempo en rango' } } },
  },
})

const load = async () => {
  if (!chart || !state.selected) return
  const rows = (await api<SummaryRow[]>(`/nodes/${state.selected}/summary?range=${state.range}`))
    .filter((r) => r.pct_in_range !== null)
  const label = (k: string) => meta().catalog.find((m) => m.key === k)?.label ?? k
  chart.data.labels = rows.map((r) => label(r.metric))
  chart.data.datasets[0]!.data = rows.map((r) => Number(r.pct_in_range))
  chart.update()
  $('#resumen-rango').textContent = `Periodo: ${state.range}`
}

export const initCompliance = () => { bus.select.on(() => void load()); bus.range.on(() => void load()) }