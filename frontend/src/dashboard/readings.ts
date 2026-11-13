import { api } from '../lib/api.js'
import { $, el } from '../lib/dom.js'
import { fmt } from '../lib/quality.js'
import type { History } from '../lib/types.js'
import { fmtTime } from './charts/common.js'
import { bus, meta, state } from './state.js'

const COLS = ['ph', 'turbidity_ntu', 'conductivity_tds', 'water_temp_c', 'flow_lpm']

const load = async () => {
  const node = state.selected
  if (!node) return

  const hist = await Promise.all(COLS.map((m) => api<History>(`/nodes/${node}/history?metric=${m}&range=${state.range}`)))

  if (node !== state.selected) return
  
  const rows = new Map<number, (number | undefined)[]>()
  hist.forEach((h, i) => {
    for (const p of h.points) { const r = rows.get(p.t) ?? []; r[i] = p.avg; rows.set(p.t, r) }
  })

  const times = [...rows.keys()].sort((a, b) => b - a).slice(0, 30)
  const metas = COLS.map((k) => meta().catalog.find((m) => m.key === k)!)
  
  $('#tabla-lecturas-sensores').replaceChildren(...times.map((t) => {
    const tr = el('tr', '', '')
    tr.append(el('td', '', fmtTime(t, state.range)))
    metas.forEach((m, i) => tr.append(el('td', '', fmt(m, rows.get(t)![i]))))
    return tr
  }))
}

export const initReadings = () => {
  bus.select.on(() => void load())
  bus.range.on(() => void load())
  setInterval(() => void load(), 30_000)
}