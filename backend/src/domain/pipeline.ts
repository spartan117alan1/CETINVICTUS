import { config } from '../config.js'
import { pool } from '../db/pool.js'
import type { ParsedTopic } from '../mqtt/topics.js'
import { parseTelemetry } from '../mqtt/parsers.js'
import { broadcast } from '../realtime/sse.js'
import type { NodeRef } from '../types.js'
import { evaluate, evaluateOffline, type AlertEvent } from './alerts.js'
import { confirmLed } from './commands.js'
import { ingest } from './ingest.js'
import { applyStatus, applyTelemetry, countOpenAlerts, getNode, sweep } from './nodeState.js'

const saneTime = (ts: number, now: number): Date => {
  const ms = ts * 1000
  return Math.abs(ms - now) < 24 * 3_600_000 ? new Date(ms) : new Date(now)
}

const lastTouch = new Map<string, number>()
const touchNode = async (ref: NodeRef, kind: string, via: string | null, now: number, force: boolean) => {
  if (!force && now - (lastTouch.get(ref.key) ?? 0) < 60_000) return
  lastTouch.set(ref.key, now)
  await pool.query(
    `INSERT INTO nodes (node_key, region, zone, device_id, kind, via, last_seen)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (node_key) DO UPDATE SET kind = $5, via = $6, last_seen = now()`,
    [ref.key, ref.region, ref.zone, ref.deviceId, kind, via])
}

const publishAlerts = async (nodeKey: string, events: AlertEvent[]) => {
  if (!events.length) return
  await countOpenAlerts(nodeKey)
  for (const e of events) broadcast('alert', e)
}

export const handleMessage = async ({ ref, type }: ParsedTopic, text: string) => {
  const now = Date.now()

  if (type === 'status') {
    const online = text === 'online'
    const { node, changed } = applyStatus(ref, online, now)
    if (changed) {
      await publishAlerts(ref.key, await evaluateOffline(ref, !online))
      broadcast('telemetry', node)
    }
    return
  }

  const t = parseTelemetry(text)
  if (!t) { console.error(`Telemetría inválida en ${ref.key}: ${text.slice(0, 200)}`); return }

  const { node, isNew, cameOnline } = applyTelemetry(ref, t, now)
  await touchNode(ref, node.kind, node.via, now, isNew)
  ingest(ref, t, saneTime(t.ts, now), now)

  const events = [
    ...(cameOnline ? await evaluateOffline(ref, false) : []),
    ...(await evaluate(ref, t, now)),
  ]
  await publishAlerts(ref.key, events)
  confirmLed(ref.key, t.metrics.led)
  broadcast('telemetry', node)
}

export const startWatchdog = () =>
  setInterval(async () => {
    try {
      for (const n of sweep(Date.now())) {
        await publishAlerts(n.key, await evaluateOffline(n, true))
        broadcast('telemetry', getNode(n.key))
      }
    } catch (e) {
      console.error('watchdog:', (e as Error).message)
    }
  }, 5000).unref()

export { config }