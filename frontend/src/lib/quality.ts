import type { Meta, MetricMeta, NodeView, Threshold } from './types.js'

export type Quality = 'ok' | 'out' | 'doubt' | 'none'

export const boundsFor = (meta: Meta, nodeKey: string, metric: string): Threshold | undefined =>
  meta.thresholds.find((t) => t.node_key === nodeKey && t.metric === metric) ??
  meta.thresholds.find((t) => t.node_key === '*' && t.metric === metric)

export const classify = (m: MetricMeta, node: NodeView, meta: Meta): Quality => {
  const v = node.metrics[m.key]
  if (typeof v !== 'number') return 'none'
  const st = m.healthKey ? node.sensors_health[m.healthKey] : undefined
  if (st !== undefined && st !== 'OK') return 'doubt'
  const b = boundsFor(meta, node.key, m.key)
  if (!b) return 'ok'
  return (b.min_value !== null && v < b.min_value) || (b.max_value !== null && v > b.max_value) ? 'out' : 'ok'
}

export const fmt = (m: MetricMeta, v: number | string | undefined): string =>
  typeof v === 'number' ? v.toFixed(m.decimals) : '—'