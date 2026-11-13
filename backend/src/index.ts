import { config } from './config.js'
import { pool } from './db/pool.js'
import { hydrateAlerts, loadThresholds } from './domain/alerts.js'
import { flush, startIngest } from './domain/ingest.js'
import { loadNodesFromDb } from './domain/nodeState.js'
import { handleMessage, startWatchdog } from './domain/pipeline.js'
import { createApp } from './http/app.js'
import { startMqtt } from './mqtt/client.js'
import { closeSseClients, startSse } from './realtime/sse.js'

await pool.query('SELECT 1')
await Promise.all([loadThresholds(), hydrateAlerts(), loadNodesFromDb()])

startSse()
startIngest()
startWatchdog()
const mqttClient = startMqtt((topic, text) =>
  handleMessage(topic, text).catch((e) => console.error('handleMessage:', (e as Error).message)))

const server = createApp().listen(config.port, () => console.log(`API en http://localhost:${config.port}`))

const shutdown = async () => {
  console.log('Cerrando...')
  closeSseClients()
  mqttClient.end(true)
  server.close()
  await flush()
  await pool.end()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)