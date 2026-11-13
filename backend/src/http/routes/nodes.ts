import { Router, type Request } from 'express'
import { z } from 'zod'
import { getHistogram, getHistory, getSummary } from '../../db/readings.js'
import { pool } from '../../db/pool.js'
import { CATALOG } from '../../domain/catalog.js'
import { sendLed } from '../../domain/commands.js'
import { getNode, listNodes } from '../../domain/nodeState.js'
import { requireAdmin, requireAuth } from '../middleware/auth.js'
import { fail } from '../middleware/error.js'

export const nodesRouter = Router()
nodesRouter.use(requireAuth)

const metricKeys = CATALOG.map((m) => m.key) as [string, ...string[]]
const Range = z.enum(['1h', '6h', '24h', '7d', '30d']).default('24h')
const MetricQ = z.object({ metric: z.enum(metricKeys), range: Range })

const keyOf = (req: Request) => [req.params.region, req.params.zone, req.params.deviceId].join('/')

nodesRouter.get('/', (_req, res) => { res.json(listNodes()) })

const node = Router({ mergeParams: true })
nodesRouter.use('/:region/:zone/:deviceId', node)

node.get('/', (req, res) => {
  const n = getNode(keyOf(req))
  if (!n) return fail(res, 404, 'Nodo no encontrado')
  res.json(n)
})

node.get('/history', async (req, res) => {
  const q = MetricQ.safeParse(req.query)
  if (!q.success) return fail(res, 400, 'Parámetros inválidos')
  res.json(await getHistory(keyOf(req), q.data.metric, q.data.range))
})

node.get('/summary', async (req, res) => {
  const q = z.object({ range: Range }).safeParse(req.query)
  if (!q.success) return fail(res, 400, 'Parámetros inválidos')
  res.json(await getSummary(keyOf(req), q.data.range))
})

node.get('/histogram', async (req, res) => {
  const q = MetricQ.extend({ bins: z.coerce.number().int().min(5).max(60).default(20) }).safeParse(req.query)
  if (!q.success) return fail(res, 400, 'Parámetros inválidos')
  res.json(await getHistogram(keyOf(req), q.data.metric, q.data.range, q.data.bins))
})

node.get('/commands', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT c.id, c.command, c.value, c.status, c.sent_at, u.nombre
     FROM command_log c LEFT JOIN users u ON u.id = c.user_id
     WHERE c.node_key = $1 ORDER BY c.id DESC LIMIT 20`, [keyOf(req)])
  res.json(rows)
})

node.post('/commands/led', requireAdmin, async (req, res) => {
  const body = z.object({ on: z.boolean() }).safeParse(req.body)
  if (!body.success) return fail(res, 400, 'Se esperaba { "on": true|false }')

  const n = getNode(keyOf(req))
  if (!n) return fail(res, 404, 'Nodo no encontrado')
  if (!n.online) return fail(res, 409, 'El nodo está sin conexión')

  try {
    const id = await sendLed(n, body.data.on, req.user!.id)
    res.status(202).json({ id, status: 'sent' })
  } catch {
    fail(res, 503, 'No se pudo publicar el comando en el broker')
  }
})

export const compareRouter = Router()
compareRouter.get('/', requireAuth, async (req, res) => {
  const q = MetricQ.extend({ nodes: z.string().min(1) }).safeParse(req.query)
  if (!q.success) return fail(res, 400, 'Parámetros inválidos')
  const keys = q.data.nodes.split(',').slice(0, 6)
  res.json(await Promise.all(keys.map(async (key) => ({
    key, ...(await getHistory(key, q.data.metric, q.data.range)),
  }))))
})