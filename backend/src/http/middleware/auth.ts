import type { RequestHandler } from 'express'
import jwt from 'jsonwebtoken'
import { config } from '../../config.js'

export interface AuthUser { id: number; rol: 'admin' | 'cliente'; correo: string; nombre: string }

declare global {
  namespace Express { interface Request { user?: AuthUser } }
}

export const COOKIE = 'cetin_session'
export const signSession = (u: AuthUser) => jwt.sign(u, config.jwtSecret, { expiresIn: '8h' })

export const requireAuth: RequestHandler = (req, res, next) => {
  try {
    req.user = jwt.verify(req.cookies?.[COOKIE] ?? '', config.jwtSecret) as AuthUser
    next()
  } catch {
    res.status(401).json({ error: 'No autenticado' })
  }
}

export const requireAdmin: RequestHandler = (req, res, next) => {
  if (req.user?.rol === 'admin') next()
  else res.status(403).json({ error: 'Solo administradores' })
}