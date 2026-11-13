import { $, el } from '../lib/dom.js'
import { fmt } from '../lib/quality.js'
import { bus, meta, selectedNode } from './state.js'

const BADGE: Record<string, string> = { OK: 'bg-success', WARNING: 'bg-warning text-dark', FAULT: 'bg-danger' }

const ago = (ms: number | null) => {
  if (ms === null) return 'nunca'
  const s = Math.round((Date.now() - ms) / 1000)
  return s < 60 ? `hace ${s} s` : `hace ${Math.round(s / 60)} min`
}

export const renderHealth = () => {
  const node = selectedNode()
  const list = $('#health-list')
  const diag = $('#diag-list')
  list.replaceChildren(); diag.replaceChildren()
  if (!node) return

  $('#node-title').textContent = node.deviceId
  $('#node-subtitle').textContent =
    `${node.region} / ${node.zone} · gateway ${node.via ?? '—'} · último dato ${ago(node.lastSeen)}`
  const badge = $('#estado-general')
  badge.textContent = node.online ? 'En línea' : 'Sin conexión'
  badge.className = `badge fs-6 ${node.online ? 'bg-success' : 'bg-danger'}`

  for (const m of meta().catalog) {
    if (m.group !== 'sensors_health' || m.kind !== 'status') continue
    const status = node.sensors_health[m.key]
    if (typeof status !== 'string') continue
    const detail = m.detailKey ? meta().catalog.find((x) => x.key === m.detailKey) : undefined
    const li = el('li', 'list-group-item d-flex justify-content-between align-items-center')
    const left = el('span', '', m.label)
    if (detail) left.append(' ', el('small', 'text-muted', `${fmt(detail, node.sensors_health[detail.key])} ${detail.unit}`))
    li.append(left, el('span', `badge rounded-pill ${BADGE[status] ?? 'bg-secondary'}`, status))
    list.append(li)
  }

  const lens = node.sensors_health.turbidity_lens_cleanliness_pct
  if (typeof lens === 'number') {
    const li = el('li', 'list-group-item')
    const bar = el('div', `progress-bar ${lens < 50 ? 'bg-danger' : lens < 80 ? 'bg-warning' : 'bg-success'}`)
    bar.style.width = `${lens}%`
    const wrap = el('div', 'progress mt-1'); wrap.style.height = '10px'; wrap.append(bar)
    li.append(el('small', 'text-muted fw-bold', `Limpieza del lente: ${lens}%`), wrap)
    list.append(li)
  }

  for (const m of meta().catalog) {
    if (m.group !== 'diagnostics' || typeof node.diagnostics[m.key] !== 'number') continue
    const li = el('li', 'list-group-item d-flex justify-content-between')
    li.append(el('span', '', m.label),
              el('span', 'badge bg-secondary rounded-pill', `${fmt(m, node.diagnostics[m.key])} ${m.unit}`))
    diag.append(li)
  }
}

export const initHealth = () => {
  bus.select.on(renderHealth)
  bus.live.on(renderHealth)
  setInterval(renderHealth, 5000)
}