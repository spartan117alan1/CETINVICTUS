import { api } from '../lib/api.js'
import { $, el } from '../lib/dom.js'
import type { Me, Report } from '../lib/types.js'
import { state } from './state.js'

export const initReports = async (me: Me) => {
  const body = $('#tabla-reportes-usuarios')

  const row = (r: Report): HTMLElement => {
    const tr = el('tr')
    const st = el('td')
    st.append(el('span', `badge ${r.status === 'Revisado' ? 'bg-success' : 'bg-warning text-dark'}`, r.status))
    const act = el('td', 'admin-only text-center')
    if (me.rol === 'admin') {
      if (r.status !== 'Revisado') {
        const ok = el('button', 'btn btn-sm btn-outline-success me-1', 'Marcar revisado')
        ok.addEventListener('click', async () => { await api(`/reports/${r.id}`, { method: 'PUT' }); await load() })
        act.append(ok)
      }
      const del = el('button', 'btn btn-sm btn-outline-danger', 'Eliminar')
      del.addEventListener('click', async () => {
        if (!confirm('¿Eliminar este reporte?')) return
        await api(`/reports/${r.id}`, { method: 'DELETE' }); await load()
      })
      act.append(del)
    }
    const nodo = r.node_key ? ` · ${r.node_key.split('/').pop()}` : ''
    tr.append(el('td', '', new Date(r.created_at).toLocaleString()), el('td', '', r.usuario),
      el('td', '', r.sensor + nodo), el('td', '', r.description), st, act)
    return tr
  }

  const load = async () => {
    const rows = await api<Report[]>('/reports')
    body.replaceChildren(...rows.map(row))
  }

  $<HTMLFormElement>('#formNuevoReporte').addEventListener('submit', async (e) => {
    e.preventDefault()
    try {
      await api('/reports', { method: 'POST', json: {
        node_key: state.selected,
        sensor: $<HTMLSelectElement>('#reporteSensor').value,
        description: $<HTMLTextAreaElement>('#reporteDesc').value,
      } })
      ;(e.target as HTMLFormElement).reset()
      $<HTMLButtonElement>('#modalReporte .btn-close').click()
      await load()
    } catch (x) { alert((x as Error).message) }
  })

  await load()
}