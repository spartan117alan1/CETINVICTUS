import pg from 'pg'
import { config } from '../config.js'

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 })
pool.on('error', (e) => console.error('PG (cliente inactivo):', e.message))