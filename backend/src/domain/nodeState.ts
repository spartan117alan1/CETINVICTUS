import { config } from '../config.js'
import { pool } from '../db/pool.js'
import type { Group, GroupName, NodeRef, NodeView, Telemetry } from '../types.js'

const nodes = new Map<string, NodeView>()

const blank = (ref: NodeRef): NodeView => ({
  ...ref, kind: 'node', via: null, online: false, lastSeen: null,
  metrics: {}, sensors_health: {}, diagnostics: {}, openAlerts: 0,
})

export const getNode = (key: string) => nodes.get(key)
export const listNodes = () => [...nodes.values()]

export const applyTelemetry = (ref: NodeRef, t: Telemetry, now: number) => {
  let n = nodes.get(ref.key)
  const isNew = !n
  if (!n) { n = blank(ref); nodes.set(ref.key, n) }
  const cameOnline = !n.online

  n.via = t.via ?? n.via
  n.kind = n.via === ref.deviceId ? 'gateway' : 'node'
  n.metrics = t.metrics
  n.sensors_health = t.sensors_health
  n.diagnostics = t.diagnostics
  n.online = true
  n.lastSeen = now
  return { node: n, isNew, cameOnline }
}

export const applyStatus = (ref: NodeRef, online: boolean, now: number) => {
  let n = nodes.get(ref.key)
  if (!n) { n = blank(ref); nodes.set(ref.key, n) }
  const changed = n.online !== online
  n.online = online
  if (online) n.lastSeen = now
  return { node: n, changed }
}

export const sweep = (now: number): NodeView[] => {
  const fallen: NodeView[] = []
  for (const n of nodes.values()) {
    if (n.online && n.lastSeen !== null && now - n.lastSeen > config.offlineAfterMs) {
      n.online = false
      fallen.push(n)
    }
  }
  return fallen
}

export const loadNodesFromDb = async () => {
  const { rows: ns } = await pool.query(
    'SELECT node_key, region, zone, device_id, kind, via, last_seen FROM nodes')
  for (const r of ns) {
    nodes.set(r.node_key, {
      ...blank({ key: r.node_key, region: r.region, zone: r.zone, deviceId: r.device_id }),
      kind: r.kind, via: r.via, lastSeen: r.last_seen ? r.last_seen.getTime() : null,
    })
  }
  const { rows } = await pool.query(`
    SELECT DISTINCT ON (node_key, metric) node_key, grp, metric, value, value_text
    FROM readings WHERE time > now() - interval '1 day'
    ORDER BY node_key, metric, time DESC`)
  for (const r of rows) {
    const n = nodes.get(r.node_key)
    if (n) (n[r.grp as GroupName] as Group)[r.metric] = r.value ?? r.value_text
  }
}

export const countOpenAlerts = async (key: string) => {
  const { rows } = await pool.query(
    'SELECT count(*)::int AS n FROM alerts WHERE node_key = $1 AND closed_at IS NULL', [key])
  const n = nodes.get(key)
  if (n) n.openAlerts = rows[0].n
}