import { Router } from 'express'
import { z } from 'zod'
import { pool } from '../../db/pool.js'
import { requireAdmin, requireAuth } from '../middleware/auth.js'
import { fail } from '../middleware/error.js'

export const reportsRouter = Router()
reportsRouter.use(requireAuth)

reportsRouter.get('/', async (req, res) => {
  const admin = req.user!.rol === 'admin'
  const { rows } = await pool.query(
    `SELECT r.id, r.created_at, r.node_key, r.sensor, r.description, r.status, u.correo AS usuario
     FROM reports r JOIN users u ON u.id = r.user_id
     WHERE ($1 OR r.user_id = $2) AND ($3::text IS NULL OR r.node_key = $3)
     ORDER BY r.id DESC`, [admin, req.user!.id, (req.query.node as string) ?? null])
  res.json(rows)                                  // el cliente solo ve los suyos: lo decide el servidor
})

const NewReport = z.object({
  node_key: z.string().nullable().default(null),
  sensor: z.string().min(1).max(80),
  description: z.string().min(1).max(1000),
})

reportsRouter.post('/', async (req, res) => {
  const p = NewReport.safeParse(req.body)
  if (!p.success) return fail(res, 400, 'Datos inválidos')
  const { rows } = await pool.query(
    'INSERT INTO reports (user_id, node_key, sensor, description) VALUES ($1,$2,$3,$4) RETURNING id',
    [req.user!.id, p.data.node_key, p.data.sensor, p.data.description])
  res.status(201).json({ id: rows[0].id })
})

reportsRouter.put('/:id', requireAdmin, async (req, res) => {
  await pool.query(`UPDATE reports SET status = 'Revisado', resolved_at = now() WHERE id = $1`, [req.params.id])
  res.status(204).end()
})

reportsRouter.delete('/:id', requireAdmin, async (req, res) => {
  await pool.query('DELETE FROM reports WHERE id = $1', [req.params.id])
  res.status(204).end()
})