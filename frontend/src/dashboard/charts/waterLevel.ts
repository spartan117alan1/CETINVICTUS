import { api } from '../../lib/api.js'
import type { History } from '../../lib/types.js'
import { bus, state } from '../state.js'
import { fmtTime, make } from './common.js'

const chart = make('graficaNivel', {
  type: 'line',
  data: { datasets: [{ label: 'Nivel de agua', data: [] as { x: number; y: number }[], stepped: true, borderColor: '#0dcaf0', backgroundColor: 'rgba(13,202,240,.15)', fill: true, pointRadius: 0 }] },
  options: {
    parsing: false, animation: false, responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { type: 'linear', ticks: { maxTicksLimit: 6, callback: (v) => fmtTime(Number(v), state.range) } },
      y: { min: -0.1, max: 1.1, ticks: { stepSize: 1, callback: (v) => (v === 1 ? 'Hay agua' : v === 0 ? 'Sin agua' : '') } },
    },
  },
})

const load = async () => {
  if (!chart || !state.selected) return
  const h = await api<History>(`/nodes/${state.selected}/history?metric=object_detected&range=${state.range}`)
  chart.data.datasets[0]!.data = h.points.map((p) => ({ x: p.t, y: p.avg >= 0.5 ? 1 : 0 }))
  chart.update()
}

export const initWaterLevel = () => { bus.select.on(() => void load()); bus.range.on(() => void load()) }