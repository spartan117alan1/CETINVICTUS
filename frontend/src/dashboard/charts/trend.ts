import { api } from '../../lib/api.js'
import type { History, NodeView } from '../../lib/types.js'
import { bus, state } from '../state.js'
import { fmtTime, make } from './common.js'

const SERIES = [
  { metric: 'ph', label: 'pH', color: '#0d6efd', axis: 'y' },
  { metric: 'turbidity_ntu', label: 'Turbidez (NTU)', color: '#198754', axis: 'y1' },
  { metric: 'water_temp_c', label: 'Temp. agua (°C)', color: '#fd7e14', axis: 'y1' },
]

const chart = make('graficaSensores', {
  type: 'line',
  data: {
    datasets: SERIES.map((s) => ({
      label: s.label, data: [] as { x: number; y: number }[], borderColor: s.color,
      yAxisID: s.axis, tension: 0.3, pointRadius: 0, borderWidth: 2,
    })),
  },
  options: {
    parsing: false, animation: false, responsive: true, maintainAspectRatio: false,
    scales: {
      x: { type: 'linear', ticks: { maxTicksLimit: 8, callback: (v) => fmtTime(Number(v), state.range) } },
      y: { position: 'left', min: 0, max: 14, title: { display: true, text: 'pH' } },
      y1: { position: 'right', grid: { drawOnChartArea: false } },
    },
  },
})

export const loadTrend = async () => {
  if (!chart || !state.selected) return
  const hist = await Promise.all(SERIES.map((s) =>
    api<History>(`/nodes/${state.selected}/history?metric=${s.metric}&range=${state.range}`)))
  hist.forEach((h, i) => { chart.data.datasets[i]!.data = h.points.map((p) => ({ x: p.t, y: p.avg })) })
  chart.update()
}

let lastPush = 0
const live = (n: NodeView) => {
  if (!chart || state.range === '7d' || state.range === '30d' || state.range === '24h') return
  const now = Date.now()
  if (now - lastPush < 10_000) return
  lastPush = now
  SERIES.forEach((s, i) => {
    const v = n.metrics[s.metric]
    const data = chart.data.datasets[i]!.data as { x: number; y: number }[]
    if (typeof v === 'number') { data.push({ x: now, y: v }); if (data.length > 2200) data.shift() }
  })
  chart.update('none')
}

export const initTrend = () => {
  bus.select.on(() => void loadTrend())
  bus.range.on(() => void loadTrend())
  bus.live.on(live)
}