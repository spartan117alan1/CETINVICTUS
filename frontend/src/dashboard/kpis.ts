import { $, el } from '../lib/dom.js'
import { classify, fmt } from '../lib/quality.js'
import { bus, meta, selectedNode } from './state.js'

const STYLE = { ok: 'bg-optimal', out: 'bg-alert', doubt: 'bg-warning-subtle', none: '' } as const
const NOTE = { ok: '', out: 'Fuera de rango', doubt: 'Dato no confiable', none: '' } as const

export const renderKpis = () => {
  const node = selectedNode()
  const row = $('#kpi-row')
  row.replaceChildren()
  if (!node) return

  const cards: HTMLElement[] = []

  const water = node.metrics.object_detected
  if (typeof water === 'number') {
    const c = el('div', `card kpi-card text-center p-3 ${water ? 'bg-optimal' : 'bg-alert'}`)
    c.append(el('h6', 'card-title text-uppercase text-muted mb-1', 'Nivel de agua'),
             el('h2', 'fw-bold mb-0', water ? 'Hay agua' : 'Sin agua'))
    cards.push(c)
  }

  for (const m of meta().catalog) {
    if (m.group !== 'metrics' || m.kind !== 'number' || typeof node.metrics[m.key] !== 'number') continue
    const q = classify(m, node, meta())
    const c = el('div', `card kpi-card text-center p-3 ${STYLE[q]}`)
    const value = el('h2', 'fw-bold mb-0', fmt(m, node.metrics[m.key]))
    if (m.unit) value.append(' ', el('small', 'fs-6', m.unit))
    c.append(el('h6', 'card-title text-uppercase text-muted mb-1', m.label), value)
    if (NOTE[q]) c.append(el('small', 'text-muted', NOTE[q]))
    cards.push(c)
  }

  for (const c of cards) {
    const col = el('div', 'col-6 col-md-4 col-xl-3')
    col.append(c)
    row.append(col)
  }
}

export const initKpis = () => {
  bus.select.on(renderKpis)
  bus.live.on(renderKpis)
}