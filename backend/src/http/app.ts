import cookieParser from 'cookie-parser'
import express from 'express'
import helmet from 'helmet'
import { config } from '../config.js'
import { sseHandler } from '../realtime/sse.js'
import { requireAuth } from './middleware/auth.js'
import { errorHandler } from './middleware/error.js'
import { alertsRouter } from './routes/alerts.js'
import { authRouter } from './routes/auth.js'
import { metaRouter } from './routes/meta.js'
import { compareRouter, nodesRouter } from './routes/nodes.js'
import { reportsRouter } from './routes/reports.js'
import { usersRouter } from './routes/users.js'

export const createApp = () => {
  const app = express()
  app.disable('x-powered-by')
  app.disable('x-powered-by')
  app.set('trust proxy', 1)
  app.use(helmet({ contentSecurityPolicy: false }))
  app.use(express.json({ limit: '100kb' }))
  app.use(cookieParser())

  app.get('/api/health', (_req, res) => { res.json({ ok: true }) })
  app.use('/api/auth', authRouter)
  app.get('/api/stream', requireAuth, sseHandler)
  app.use('/api/meta', metaRouter)
  app.use('/api/nodes', nodesRouter)
  app.use('/api/compare', compareRouter)
  app.use('/api/alerts', alertsRouter)
  app.use('/api/reports', reportsRouter)
  app.use('/api/users', usersRouter)
  app.use('/api', (_req, res) => { res.status(404).json({ error: 'Recurso no encontrado' }) })

  if (config.staticDir) app.use(express.static(config.staticDir))
  app.use(errorHandler)
  return app
}