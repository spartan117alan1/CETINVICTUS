import bcrypt from 'bcryptjs'
import { Router } from 'express'
import { z } from 'zod'
import { pool } from '../../db/pool.js'
import { requireAdmin, requireAuth } from '../middleware/auth.js'
import { fail } from '../middleware/error.js'

export const usersRouter = Router()
usersRouter.use(requireAuth, requireAdmin)

const COLS = 'id, nombre, apellido, edad, telefono, correo, compania, estado, colonia, rol, is_root'

const User = z.object({
  rol: z.enum(['admin', 'cliente']),
  nombre: z.string().min(1), apellido: z.string().min(1),
  edad: z.number().int().nullable().default(null),
  telefono: z.string().nullable().default(null),
  correo: z.string().email(),
  compania: z.string().nullable().default(null),
  estado: z.string().nullable().default(null),
  colonia: z.string().nullable().default(null),
  password: z.string().min(8).optional(),
})

usersRouter.get('/', async (_req, res) => {
  const { rows } = await pool.query(`SELECT ${COLS} FROM users ORDER BY id`)
  res.json(rows)
})

usersRouter.post('/', async (req, res) => {
  const p = User.safeParse(req.body)
  if (!p.success || !p.data.password) return fail(res, 400, 'Datos inválidos (contraseña de 8+ caracteres)')
  const u = p.data
  try {
    const { rows } = await pool.query(
      `INSERT INTO users (rol, nombre, apellido, edad, telefono, correo, compania, estado, colonia, password_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [u.rol, u.nombre, u.apellido, u.edad, u.telefono, u.correo, u.compania, u.estado, u.colonia,
       await bcrypt.hash(u.password!, 10)])
    res.status(201).json({ id: rows[0].id })
  } catch (e) {
    if ((e as { code?: string }).code === '23505') return fail(res, 409, 'El correo ya está registrado')
    throw e
  }
})

usersRouter.put('/:id', async (req, res) => {
  const p = User.safeParse(req.body)
  if (!p.success) return fail(res, 400, 'Datos inválidos')
  const u = p.data
  await pool.query(
    `UPDATE users SET rol=$2, nombre=$3, apellido=$4, edad=$5, telefono=$6, correo=$7,
            compania=$8, estado=$9, colonia=$10,
            password_hash = COALESCE($11, password_hash)
     WHERE id = $1`,
    [req.params.id, u.rol, u.nombre, u.apellido, u.edad, u.telefono, u.correo, u.compania, u.estado, u.colonia,
     u.password ? await bcrypt.hash(u.password, 10) : null])
  res.status(204).end()
})

usersRouter.delete('/:id', async (req, res) => {
  if (Number(req.params.id) === req.user!.id) return fail(res, 409, 'No puedes eliminar tu propia cuenta')
  const { rowCount } = await pool.query('DELETE FROM users WHERE id = $1 AND NOT is_root', [req.params.id])
  if (!rowCount) return fail(res, 409, 'Cuenta protegida o inexistente')
  res.status(204).end()
})