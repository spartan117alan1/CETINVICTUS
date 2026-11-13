import type { AlertEvent, CommandEvent, NodeView } from './types.js'

export interface StreamHandlers {
  snapshot(nodes: NodeView[]): void
  telemetry(node: NodeView): void
  alert(e: AlertEvent): void
  command(e: CommandEvent): void
  connection(ok: boolean): void
}

export const openStream = (h: StreamHandlers): (() => void) => {
  const es = new EventSource('/api/stream')
  const on = <T>(name: string, fn: (d: T) => void) =>
    es.addEventListener(name, (e) => fn(JSON.parse((e as MessageEvent<string>).data) as T))

  es.onopen = () => h.connection(true)
  es.onerror = () => h.connection(false)
  on<{ nodes: NodeView[] }>('snapshot', (d) => h.snapshot(d.nodes))
  on<NodeView>('telemetry', h.telemetry)
  on<AlertEvent>('alert', h.alert)
  on<CommandEvent>('command', h.command)
  return () => es.close()
}