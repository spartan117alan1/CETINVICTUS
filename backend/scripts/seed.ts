import bcrypt from 'bcryptjs'
import { pool } from '../src/db/pool.js'

const correo = process.env.ADMIN_EMAIL ?? 'admin@cetinvictus.com'
const pass = process.env.ADMIN_PASSWORD
if (!pass || pass.length < 10) throw new Error('Define ADMIN_PASSWORD (10+ caracteres)')

await pool.query(
  `INSERT INTO users (nombre, apellido, correo, password_hash, rol, is_root)
   VALUES ('Admin', 'Principal', $1, $2, 'admin', true) ON CONFLICT DO NOTHING`,
  [correo, await bcrypt.hash(pass, 10)])
await pool.end()
console.log('Admin listo:', correo)