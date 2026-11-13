import { api } from '../lib/api.js'
import { $, el } from '../lib/dom.js'
import type { Alert, AlertEvent, Me } from '../lib/types.js'
import { bus, state } from './state.js'

const SEV = { info: 'text-info', warning: 'text-warning', critical: 'text-danger' } as const
let me: Me

const row = (a: Alert): HTMLElement => {
  const tr = el('tr', a.closed_at ? 'text-muted' : '')
  tr.dataset.id = a.id
  const hora = new Date(a.opened_at).toLocaleTimeString()
  tr.append(el('td', '', hora),
            el('td', `fw-bold ${SEV[a.severity]}`, a.rule),
            el('td', '', a.message),
            el('td', '', a.closed_at ? 'Resuelta' : 'Abierta'))
  const act = el('td', 'text-center')
  if (me.rol === 'admin' && !a.ack_at && !a.closed_at) {
    const b = el('button', 'btn btn-sm btn-outline-dark', 'Reconocer')
    b.addEventListener('click', async () => { await api(`/alerts/${a.id}/ack`, { method: 'POST' }); b.remove() })
    act.append(b)
  }
  tr.append(act)
  return tr
}

export const loadAlerts = async () => {
  if (!state.selected) return
  const rows = await api<Alert[]>(`/alerts?node=${encodeURIComponent(state.selected)}&limit=50`)
  $('#tabla-alertas').replaceChildren(...rows.map(row))
}

export const onAlert = (e: AlertEvent) => {
  if (e.alert.node_key !== state.selected) return
  const body = $('#tabla-alertas')
  body.querySelector(`[data-id="${e.alert.id}"]`)?.remove()
  body.prepend(row(e.alert))
}

export const initAlerts = (user: Me) => { me = user; bus.select.on(() => void loadAlerts()) }