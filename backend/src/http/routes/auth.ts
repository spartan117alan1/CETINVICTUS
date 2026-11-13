import bcrypt from 'bcryptjs'
import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { config } from '../../config.js'
import { pool } from '../../db/pool.js'
import { COOKIE, requireAuth, signSession, type AuthUser } from '../middleware/auth.js'
import { fail } from '../middleware/error.js'

export const authRouter = Router()

const limiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: true, legacyHeaders: false })
const DUMMY = bcrypt.hashSync('no-existe', 10)
const Body = z.object({ correo: z.string().email(), password: z.string().min(1) })

authRouter.post('/login', limiter, async (req, res) => {
  const p = Body.safeParse(req.body)
  if (!p.success) return fail(res, 400, 'Datos inválidos')

  const { rows } = await pool.query(
    'SELECT id, nombre, apellido, rol, correo, password_hash FROM users WHERE lower(correo) = lower($1)',
    [p.data.correo])
  const u = rows[0]
  const ok = await bcrypt.compare(p.data.password, u?.password_hash ?? DUMMY)
  if (!u || !ok) return fail(res, 401, 'Correo o contraseña incorrectos')

  const user: AuthUser = { id: u.id, rol: u.rol, correo: u.correo, nombre: `${u.nombre} ${u.apellido}` }
  res.cookie(COOKIE, signSession(user), {
    httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, maxAge: 8 * 3_600_000,
  })
  res.json(user)
})

authRouter.post('/logout', (_req, res) => { res.clearCookie(COOKIE); res.status(204).end() })
authRouter.get('/me', requireAuth, (req, res) => { res.json(req.user) })