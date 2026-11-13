import type { Group, Scalar, Telemetry } from '../types.js'

const isScalar = (x: unknown): x is Scalar =>
  typeof x === 'number' ? Number.isFinite(x) : typeof x === 'string'

const toGroup = (v: unknown): Group | null => {
  if (v === undefined) return {}
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null
  const out: Group = {}
  for (const [k, x] of Object.entries(v)) if (isScalar(x)) out[k] = x
  return out
}

export const parseTelemetry = (text: string): Telemetry | null => {
  try {
    const d = JSON.parse(text) as Record<string, unknown>
    if (typeof d !== 'object' || d === null || typeof d.ts !== 'number') return null
    const metrics = toGroup(d.metrics)
    const health = toGroup(d.sensors_health)
    const diag = toGroup(d.diagnostics)
    if (!metrics || !health || !diag) return null
    return {
      ts: d.ts,
      via: typeof d.via === 'string' ? d.via : undefined,
      metrics, sensors_health: health, diagnostics: diag,
    }
  } catch {
    return null
  }
}