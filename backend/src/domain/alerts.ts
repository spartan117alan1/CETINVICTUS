import { pool } from '../db/pool.js'
import type { NodeRef, Telemetry } from '../types.js'
import { CATALOG, isHealthy, labelOf, type MetricMeta } from './catalog.js'

export type Severity = 'info' | 'warning' | 'critical'
export interface AlertRow {
  id: string; node_key: string; rule: string; metric: string | null; severity: Severity
  message: string; value: number | null; opened_at: Date; closed_at: Date | null
}
export interface AlertEvent { state: 'opened' | 'closed'; alert: AlertRow }

const NEED = 3

interface Bounds { min: number | null; max: number | null; severity: Severity }
let thresholds = new Map<string, Bounds>()

export const loadThresholds = async () => {
  const { rows } = await pool.query(
    'SELECT node_key, metric, min_value, max_value, severity FROM thresholds')
  thresholds = new Map(rows.map((r) => [
    `${r.node_key}|${r.metric}`, { min: r.min_value, max: r.max_value, severity: r.severity },
  ]))
}
const boundsFor = (node: string, metric: string) =>
  thresholds.get(`${node}|${metric}`) ?? thresholds.get(`*|${metric}`)

interface Flip { bad: number; good: number; open: boolean }
const flips = new Map<string, Flip>()
const idOf = (node: string, rule: string, metric: string | null) => `${node}|${rule}|${metric ?? ''}`
const isOpen = (node: string, rule: string, metric: string) => flips.get(idOf(node, rule, metric))?.open ?? false

/** Tras un reinicio, las alertas abiertas en BD deben poder cerrarse. */
export const hydrateAlerts = async () => {
  const { rows } = await pool.query('SELECT node_key, rule, metric FROM alerts WHERE closed_at IS NULL')
  for (const r of rows) flips.set(idOf(r.node_key, r.rule, r.metric), { bad: NEED, good: 0, open: true })
}

interface Check {
  node: string; rule: string; metric: string | null
  bad: boolean; severity: Severity; message: string
  value?: number; need?: number
}

const run = async (c: Check, out: AlertEvent[]) => {
  const key = idOf(c.node, c.rule, c.metric)
  const f = flips.get(key) ?? { bad: 0, good: 0, open: false }
  flips.set(key, f)
  if (c.bad) { f.bad++; f.good = 0 } else { f.good++; f.bad = 0 }
  const need = c.need ?? NEED

  if (!f.open && f.bad >= need) {
    f.open = true
    const { rows } = await pool.query(
      `INSERT INTO alerts (node_key, rule, metric, severity, message, value)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING RETURNING *`,
      [c.node, c.rule, c.metric, c.severity, c.message, c.value ?? null])
    if (rows[0]) out.push({ state: 'opened', alert: rows[0] })
  } else if (f.open && f.good >= need) {
    f.open = false
    const { rows } = await pool.query(
      `UPDATE alerts SET closed_at = now()
       WHERE node_key = $1 AND rule = $2 AND COALESCE(metric, '') = $3 AND closed_at IS NULL RETURNING *`,
      [c.node, c.rule, c.metric ?? ''])
    if (rows[0]) out.push({ state: 'closed', alert: rows[0] })
  }
}

class Baseline {
  private mean = 0
  private variance = 0
  private n = 0
  constructor(private floor: number) {}

  update(x: number, alpha = 0.01, warmup = 120): number | null {
    if (this.n === 0) { this.mean = x; this.n = 1; return null }
    const d = x - this.mean
    const std = Math.max(Math.sqrt(this.variance), this.floor)
    const z = this.n >= warmup ? d / std : null
    this.mean += alpha * d
    this.variance = (1 - alpha) * (this.variance + alpha * d * d)
    this.n++
    return z
  }
}
const baselines = new Map<string, Baseline>()
const same = new Map<string, { v: number; since: number }>()

const baselineOf = (node: string, m: MetricMeta) => {
  const k = `${node}|${m.key}`
  let b = baselines.get(k)
  if (!b) { b = new Baseline(m.noiseFloor ?? 0); baselines.set(k, b) }
  return b
}

export const evaluate = async (ref: NodeRef, t: Telemetry, now: number): Promise<AlertEvent[]> => {
  const out: AlertEvent[] = []
  const node = ref.key

  for (const [k, v] of Object.entries(t.sensors_health)) {
    if (!k.endsWith('_status')) continue
    await run({
      node, rule: 'sensor_health', metric: k, bad: v !== 'OK',
      severity: v === 'FAULT' ? 'critical' : 'warning', message: `${labelOf(k)}: ${v}`,
    }, out)
  }

  for (const meta of CATALOG) {
    if (meta.group !== 'metrics' || meta.kind !== 'number') continue
    const x = t.metrics[meta.key]
    if (typeof x !== 'number') continue
    const healthy = isHealthy(t.sensors_health, meta.healthKey)
    const shown = `${x.toFixed(meta.decimals)} ${meta.unit}`.trim()

    const b = boundsFor(node, meta.key)
    if (b) {
      const outside = healthy && ((b.min !== null && x < b.min) || (b.max !== null && x > b.max))
      await run({
        node, rule: 'range', metric: meta.key, bad: outside, severity: b.severity, value: x,
        message: `${meta.label} fuera de rango: ${shown}`,
      }, out)
    }

    if (meta.noiseFloor !== undefined && healthy) {
      const z = baselineOf(node, meta).update(x)
      const limit = isOpen(node, 'anomaly', meta.key) ? 2 : 4
      await run({
        node, rule: 'anomaly', metric: meta.key, bad: z !== null && Math.abs(z) > limit,
        severity: 'warning', value: x, message: `${meta.label}: comportamiento anómalo (${shown})`,
      }, out)
    }

    if (meta.flatlineMs) {
      const k = `${node}|${meta.key}`
      const s = same.get(k) ?? { v: x, since: now }
      if (s.v !== x) { s.v = x; s.since = now }
      same.set(k, s)
      await run({
        node, rule: 'flatline', metric: meta.key, bad: now - s.since >= meta.flatlineMs, need: 1,
        severity: 'warning', value: x, message: `${meta.label}: valor sin cambios (sensor congelado)`,
      }, out)
    }
  }

  const water = t.metrics.object_detected
  if (typeof water === 'number') {
    await run({
      node, rule: 'no_water', metric: 'object_detected', bad: water === 0, need: 5,
      severity: 'warning', message: 'No se detecta agua en el nivel del tanque',
    }, out)
  }
  return out
}

export const evaluateOffline = async (ref: NodeRef, offline: boolean): Promise<AlertEvent[]> => {
  const out: AlertEvent[] = []
  await run({
    node: ref.key, rule: 'offline', metric: null, bad: offline, need: 1,
    severity: 'critical', message: 'Dispositivo sin comunicación',
  }, out)
  return out
}