import type { ErrorRequestHandler, Response } from 'express'

export const fail = (res: Response, code: number, error: string): void => {
  res.status(code).json({ error })
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({ error: 'Error interno' })
}