import type { RequestHandler, Response } from 'express'
import { config } from '../config.js'
import { listNodes } from '../domain/nodeState.js'

const clients = new Set<Response>()

const send = (res: Response, event: string, data: unknown) =>
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)

export const broadcast = (event: string, data: unknown) => {
  for (const c of clients) send(c, event, data)
}

export const sseHandler: RequestHandler = (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  res.write('retry: 2000\n\n')
  send(res, 'snapshot', { nodes: listNodes() })
  clients.add(res)
  req.on('close', () => clients.delete(res))
}

export const startSse = () =>
  setInterval(() => { for (const c of clients) c.write(': ping\n\n') }, config.sseKeepAliveMs).unref()

export const closeSseClients = () => {
  for (const c of clients) c.end()
  clients.clear()
}