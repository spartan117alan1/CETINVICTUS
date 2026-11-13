import { config } from '../config.js'
import type { NodeRef } from '../types.js'

export type MsgType = 'telemetry' | 'status'
export interface ParsedTopic { ref: NodeRef; type: MsgType }

export const subscriptions = [
  `${config.mqtt.org}/+/+/+/telemetry`,
  `${config.mqtt.org}/+/+/+/status`,
]

export const parseTopic = (topic: string): ParsedTopic | null => {
  const [org, region, zone, deviceId, type, ...rest] = topic.split('/')
  if (org !== config.mqtt.org || !region || !zone || !deviceId || rest.length) return null
  if (type !== 'telemetry' && type !== 'status') return null
  return { ref: { key: `${region}/${zone}/${deviceId}`, region, zone, deviceId }, type }
}

export const commandTopic = (n: NodeRef, command: string) =>
  `${config.mqtt.org}/${n.region}/${n.zone}/${n.deviceId}/cmd/${command}`