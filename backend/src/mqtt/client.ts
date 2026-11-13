import { connect, type MqttClient } from 'mqtt'
import { config } from '../config.js'
import { parseTopic, subscriptions, type ParsedTopic } from './topics.js'

let client: MqttClient | undefined

export const startMqtt = (onMessage: (t: ParsedTopic, text: string) => void): MqttClient => {
  client = connect(config.mqtt.url, {
    reconnectPeriod: 2000,
    clientId: `cetin-backend-${Math.random().toString(16).slice(2, 8)}`,
  })

  client.on('connect', () => {
    console.log('MQTT conectado')
    client?.subscribe(subscriptions, { qos: 1 }, (err) => {
      if (err) console.error('Error al suscribirse:', err.message)
    })
  })
  client.on('error', (e) => console.error('MQTT error:', e.message))
  client.on('offline', () => console.warn('MQTT sin conexión al broker'))

  client.on('message', (topic, payload) => {
    const parsed = parseTopic(topic)
    const text = payload.toString().trim()
    if (parsed && text) onMessage(parsed, text)
  })
  return client
}

export const publish = (topic: string, payload: string): Promise<void> =>
  new Promise((resolve, reject) => {
    if (!client?.connected) return reject(new Error('Broker MQTT no disponible'))
    client.publish(topic, payload, { qos: 1, retain: false }, (err) => (err ? reject(err) : resolve()))
  })