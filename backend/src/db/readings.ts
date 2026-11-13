import { pool } from './pool.js'

export const RANGE_SECONDS = {
  '1h': 3_600, '6h': 21_600, '24h': 86_400, '7d': 604_800, '30d': 2_592_000,
} as const
export type RangeKey = keyof typeof RANGE_SECONDS

interface Source { table: string; time: string; avg: string; min: string; max: string }
const RAW: Source = { table: 'readings', time: 'time', avg: 'value', min: 'value', max: 'value' }
const ONE_MIN: Source = { table: 'readings_1m', time: 'bucket', avg: 'avg', min: 'min', max: 'max' }
const ONE_HOUR: Source = { table: 'readings_1h', time: 'bucket', avg: 'avg', min: 'min', max: 'max' }

const sourceFor = (secs: number): Source => (secs <= 6 * 3600 ? RAW : secs <= 3 * 86_400 ? ONE_MIN : ONE_HOUR)

export const getHistory = async (nodeKey: string, metric: string, range: RangeKey) => {
  const secs = RANGE_SECONDS[range]
  const s = sourceFor(secs)
  const { rows } = await pool.query(
    `SELECT ${s.time} AS t, ${s.avg} AS avg, ${s.min} AS min, ${s.max} AS max
     FROM ${s.table}
     WHERE node_key = $1 AND metric = $2 AND ${s.time} >= now() - make_interval(secs => $3)
       AND ${s.avg} IS NOT NULL
     ORDER BY t`, [nodeKey, metric, secs])
  return {
    metric, bucket: s === RAW ? 'raw' : s === ONE_MIN ? '1m' : '1h',
    points: rows.map((r) => ({ t: new Date(r.t).getTime(), avg: r.avg, min: r.min, max: r.max })),
  }
}

export const getSummary = async (nodeKey: string, range: RangeKey) => {
  const secs = RANGE_SECONDS[range]
  const s = sourceFor(secs)
  const { rows } = await pool.query(
    `SELECT r.metric,
            avg(r.v) AS avg, min(r.v) AS min, max(r.v) AS max, count(*)::int AS n,
            round(100.0 * count(*) FILTER (WHERE (th.min_value IS NULL OR r.v >= th.min_value)
                                             AND (th.max_value IS NULL OR r.v <= th.max_value))
                  / NULLIF(count(*), 0), 1) AS pct_in_range
     FROM (SELECT metric, ${s.avg} AS v FROM ${s.table}
           WHERE node_key = $1 AND grp = 'metrics' AND ${s.time} >= now() - make_interval(secs => $2)
             AND ${s.avg} IS NOT NULL) r
     LEFT JOIN LATERAL (
       SELECT min_value, max_value FROM thresholds t
       WHERE t.metric = r.metric AND t.node_key IN ($1, '*')
       ORDER BY (t.node_key = '*') LIMIT 1) th ON true
     GROUP BY r.metric`, [nodeKey, secs])
  return rows
}

export const getHistogram = async (nodeKey: string, metric: string, range: RangeKey, bins: number) => {
  const secs = RANGE_SECONDS[range]
  const s = sourceFor(secs)
  const { rows } = await pool.query(
    `WITH d AS (
       SELECT ${s.avg} AS v FROM ${s.table}
       WHERE node_key = $1 AND metric = $2 AND ${s.time} >= now() - make_interval(secs => $3)
         AND ${s.avg} IS NOT NULL),
     b AS (SELECT min(v) AS lo, max(v) AS hi FROM d)
     SELECT b.lo, b.hi, width_bucket(d.v, b.lo, b.hi + 1e-9, $4) AS bin, count(*)::int AS n
     FROM d, b GROUP BY b.lo, b.hi, bin ORDER BY bin`, [nodeKey, metric, secs, bins])
  if (!rows.length) return { lo: 0, hi: 0, counts: [] as number[] }
  const counts = Array<number>(bins).fill(0)
  for (const r of rows) counts[r.bin - 1] = r.n
  return { lo: rows[0].lo as number, hi: rows[0].hi as number, counts }
}