import { api } from '../lib/api.js'
import { $ } from '../lib/dom.js'
import { openStream } from '../lib/sse.js'
import type { Me, Meta, RangeKey } from '../lib/types.js'
import { initAlerts, onAlert } from '../dashboard/alerts.js'
import { initCompliance } from '../dashboard/charts/compliance.js'
import { initHistogram } from '../dashboard/charts/histogram.js'
import { initLimits } from '../dashboard/charts/limits.js'
import { initQuality } from '../dashboard/charts/quality.js'
import { initTrend } from '../dashboard/charts/trend.js'
import { initWaterLevel } from '../dashboard/charts/waterLevel.js'
import { initHealth } from '../dashboard/health.js'
import { initKpis } from '../dashboard/kpis.js'
import { initLedControl, onCommand } from '../dashboard/ledControl.js'
import { initNodeSelector } from '../dashboard/nodeSelector.js'
import { bus, state } from '../dashboard/state.js'
import { initPdf } from '../dashboard/pdf.js'
import { initReports } from '../dashboard/reports.js'
import { initReadings } from '../dashboard/readings.js'

const me = await api<Me>('/auth/me')
state.meta = await api<Meta>('/meta')

$('#user-info-badge').textContent = `👤 ${me.nombre} | Rol: ${me.rol === 'admin' ? 'Administrador' : 'Cliente'}`

document.body.dataset.role = me.rol

$('#btn-salir').addEventListener('click', async () => { await api('/auth/logout', { method: 'POST' }); location.href = 'login.html' })
$<HTMLSelectElement>('#range-select').addEventListener('change', (e) => {
  state.range = (e.target as HTMLSelectElement).value as RangeKey
  bus.range.emit(state.range)
})

initKpis(); initHealth(); initLedControl(); initAlerts(me)
initTrend(); initQuality(); initLimits(); initWaterLevel()
initCompliance(); initHistogram();
initPdf(); void initReports(me); initReadings()

let started = false
openStream({
  snapshot(nodes) {
    state.nodes = new Map(nodes.map((n) => [n.key, n]))
    if (!started) { started = true; initNodeSelector() }
    bus.nodes.emit()
  },
  telemetry(n) {
    const isNew = !state.nodes.has(n.key)
    state.nodes.set(n.key, n)
    if (isNew) bus.nodes.emit()
    if (n.key === state.selected) bus.live.emit(n)
  },
  alert: onAlert,
  command: onCommand,
  connection(ok) {
    $('#conn-status').textContent = ok ? '' : 'Reconectando con el servidor…'
  },
})