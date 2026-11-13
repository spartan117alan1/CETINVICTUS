import { api } from '../lib/api.js'
import { $ } from '../lib/dom.js'
import type { CommandEvent } from '../lib/types.js'
import { bus, selectedNode, state } from './state.js'

const sw = () => $<HTMLInputElement>('#led-switch')
const status = (text: string, cls = 'text-muted') => {
  const s = $('#led-status')
  s.textContent = text
  s.className = `small ${cls}`
}
const currentLed = () => selectedNode()?.metrics.led === 1

export const initLedControl = () => {
  sw().addEventListener('change', async () => {
    const node = selectedNode()
    if (!node) return
    const want = sw().checked
    sw().disabled = true
    status('Enviando comando…')
    try {
      await api(`/nodes/${node.key}/commands/led`, { method: 'POST', json: { on: want } })
      status('Esperando confirmación del nodo…')
    } catch (e) {
      sw().checked = !want
      sw().disabled = false
      status(`Error: ${(e as Error).message}`, 'text-danger')
    }
  })

  bus.select.on(() => { sw().checked = currentLed(); sw().disabled = false; status('') })
  bus.live.on(() => { if (!sw().disabled) sw().checked = currentLed() })
}

export const onCommand = (e: CommandEvent) => {
  if (e.nodeKey !== state.selected) return
  if (e.status === 'confirmed') { sw().disabled = false; sw().checked = e.value === 1; status('Confirmado por el nodo', 'text-success') }
  if (e.status === 'timeout') { sw().disabled = false; sw().checked = currentLed(); status('El nodo no respondió', 'text-danger') }
  if (e.status === 'failed') { sw().disabled = false; sw().checked = currentLed(); status('No se pudo enviar al broker', 'text-danger') }
}