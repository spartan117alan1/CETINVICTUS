import { Router } from 'express'
import { z } from 'zod'
import { pool } from '../../db/pool.js'
import { requireAdmin, requireAuth } from '../middleware/auth.js'
import { fail } from '../middleware/error.js'

export const alertsRouter = Router()
alertsRouter.use(requireAuth)

alertsRouter.get('/', async (req, res) => {
  const q = z.object({
    node: z.string().optional(),
    state: z.enum(['open', 'all']).default('all'),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  }).safeParse(req.query)
  if (!q.success) return fail(res, 400, 'Parámetros inválidos')

  const { rows } = await pool.query(
    `SELECT * FROM alerts
     WHERE ($1::text IS NULL OR node_key = $1) AND ($2 = 'all' OR closed_at IS NULL)
     ORDER BY opened_at DESC LIMIT $3`, [q.data.node ?? null, q.data.state, q.data.limit])
  res.json(rows)
})

alertsRouter.post('/:id/ack', requireAdmin, async (req, res) => {
  const { rowCount } = await pool.query(
    'UPDATE alerts SET ack_by = $2, ack_at = now() WHERE id = $1 AND ack_at IS NULL',
    [req.params.id, req.user!.id])
  if (!rowCount) return fail(res, 404, 'Alerta no encontrada o ya reconocida')
  res.status(204).end()
})