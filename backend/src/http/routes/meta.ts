import { Router } from 'express'
import { z } from 'zod'
import { pool } from '../../db/pool.js'
import { loadThresholds } from '../../domain/alerts.js'
import { CATALOG } from '../../domain/catalog.js'
import { requireAdmin, requireAuth } from '../middleware/auth.js'
import { fail } from '../middleware/error.js'

export const metaRouter = Router()
metaRouter.use(requireAuth)

metaRouter.get('/', async (_req, res) => {
  const { rows } = await pool.query('SELECT node_key, metric, min_value, max_value, severity FROM thresholds')
  res.json({ catalog: CATALOG, thresholds: rows })
})

const Threshold = z.object({
  node_key: z.string().default('*'),
  metric: z.string(),
  min_value: z.number().nullable(),
  max_value: z.number().nullable(),
  severity: z.enum(['info', 'warning', 'critical']).default('warning'),
})

metaRouter.put('/thresholds', requireAdmin, async (req, res) => {
  const p = Threshold.safeParse(req.body)
  if (!p.success) return fail(res, 400, 'Datos inválidos')
  const t = p.data
  await pool.query(
    `INSERT INTO thresholds (node_key, metric, min_value, max_value, severity) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (node_key, metric) DO UPDATE SET min_value = $3, max_value = $4, severity = $5`,
    [t.node_key, t.metric, t.min_value, t.max_value, t.severity])
  await loadThresholds()
  res.status(204).end()
})