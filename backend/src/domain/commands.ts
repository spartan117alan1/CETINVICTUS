import { config } from '../config.js'
import { pool } from '../db/pool.js'
import { publish } from '../mqtt/client.js'
import { commandTopic } from '../mqtt/topics.js'
import { broadcast } from '../realtime/sse.js'
import type { NodeRef } from '../types.js'

interface Pending { id: number; expected: 0 | 1; timer: NodeJS.Timeout }
const pending = new Map<string, Pending>()

type Status = 'confirmed' | 'timeout' | 'failed'

const settle = (nodeKey: string, id: number, status: Status, value: 0 | 1) => {
  pending.delete(nodeKey)
  pool.query(
    `UPDATE command_log SET status = $2, confirmed_at = CASE WHEN $2 = 'confirmed' THEN now() END WHERE id = $1`,
    [id, status]).catch((e) => console.error('command_log:', e.message))
  broadcast('command', { nodeKey, id, command: 'led', value, status })
}

export const sendLed = async (node: NodeRef, on: boolean, userId: number): Promise<number> => {
  const value = on ? 1 : 0
  const old = pending.get(node.key)
  if (old) clearTimeout(old.timer)

  const { rows } = await pool.query(
    `INSERT INTO command_log (node_key, command, value, user_id) VALUES ($1, 'led', $2, $3) RETURNING id`,
    [node.key, String(value), userId])
  const id = Number(rows[0].id)

  try {
    await publish(commandTopic(node, 'led'), String(value))
  } catch (e) {
    settle(node.key, id, 'failed', value)
    throw e
  }

  const timer = setTimeout(() => settle(node.key, id, 'timeout', value), config.commandTimeoutMs)
  pending.set(node.key, { id, expected: value, timer })
  broadcast('command', { nodeKey: node.key, id, command: 'led', value, status: 'sent' })
  return id
}

export const confirmLed = (nodeKey: string, reported: unknown) => {
  const p = pending.get(nodeKey)
  if (p && reported === p.expected) {
    clearTimeout(p.timer)
    settle(nodeKey, p.id, 'confirmed', p.expected)
  }
}