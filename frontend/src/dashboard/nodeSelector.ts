import { $, el } from '../lib/dom.js'
import { bus, state } from './state.js'

const sel = () => $<HTMLSelectElement>('#node-select')

export const renderNodeSelector = () => {
  const groups = new Map<string, HTMLOptGroupElement>()
  const select = sel()
  select.replaceChildren()

  const nodes = [...state.nodes.values()].filter((n) => n.kind === 'node')
    .sort((a, b) => a.key.localeCompare(b.key))
  for (const n of nodes) {
    const gw = n.via ?? 'sin gateway'
    let g = groups.get(gw)
    if (!g) {
      g = document.createElement('optgroup')
      g.label = `Gateway ${gw}`
      groups.set(gw, g)
      select.append(g)
    }
    const o = el('option', '', `${n.online ? 'Online' : 'Offline'} ${n.deviceId} · ${n.zone}`) as HTMLOptionElement
    o.value = n.key
    o.selected = n.key === state.selected
    g.append(o)
  }
}

export const initNodeSelector = () => {
  sel().addEventListener('change', () => selectNode(sel().value))
  bus.nodes.on(renderNodeSelector)

  const fromUrl = new URLSearchParams(location.search).get('node')
  const first = [...state.nodes.values()].find((n) => n.kind === 'node')
  const initial = (fromUrl && state.nodes.has(fromUrl) ? fromUrl : first?.key) ?? null
  if (initial) selectNode(initial)
  renderNodeSelector()
}

export const selectNode = (key: string) => {
  state.selected = key
  history.replaceState(null, '', `?node=${encodeURIComponent(key)}`)
  bus.select.emit(key)
  renderNodeSelector()
}