import { config } from '../config.js'
import { pool } from '../db/pool.js'
import { GROUPS, type GroupName, type NodeRef, type Scalar, type Telemetry } from '../types.js'
import { metaOf } from './catalog.js'

interface Row {
  time: Date; node_key: string; grp: GroupName; metric: string
  value: number | null; value_text: string | null
}

const buffer: Row[] = []
const lastSaved = new Map<string, { at: number; v: Scalar }>()
const MAX_BUFFER = 20_000

export const ingest = (ref: NodeRef, t: Telemetry, time: Date, now: number) => {
  for (const grp of GROUPS) {
    const every = grp === 'metrics' ? config.persistEveryMs : config.persistSlowEveryMs
    for (const [metric, v] of Object.entries(t[grp])) {
      const k = `${ref.key}|${metric}`
      const prev = lastSaved.get(k)
      const isEvent = typeof v === 'string' || metaOf(metric)?.kind === 'boolean'
      const changed = prev !== undefined && prev.v !== v

      if (prev && !(isEvent && changed) && now - prev.at < every) continue

      lastSaved.set(k, { at: now, v })
      if (buffer.length >= MAX_BUFFER) buffer.shift()
      buffer.push({
        time, node_key: ref.key, grp, metric,
        value: typeof v === 'number' ? v : null,
        value_text: typeof v === 'string' ? v : null,
      })
    }
  }
}

export const flush = async () => {
  if (!buffer.length) return
  const batch = buffer.splice(0, buffer.length)
  try {
    await pool.query(
      `INSERT INTO readings (time, node_key, grp, metric, value, value_text)
       SELECT * FROM unnest($1::timestamptz[], $2::text[], $3::text[], $4::text[], $5::float8[], $6::text[])`,
      [
        batch.map((r) => r.time), batch.map((r) => r.node_key), batch.map((r) => r.grp),
        batch.map((r) => r.metric), batch.map((r) => r.value), batch.map((r) => r.value_text),
      ])
  } catch (e) {
    console.error('Fallo al guardar lecturas, reintento luego:', (e as Error).message)
    buffer.unshift(...batch)
  }
}

export const startIngest = () => setInterval(flush, 1000).unref()