import bcrypt from 'bcryptjs'
import sqlite3 from 'sqlite3'
import { pool } from '../src/db/pool.js'

const sqlite = new sqlite3.Database(process.argv[2] ?? './db/cetinvictus.db')
const all = <T>(sql: string) => new Promise<T[]>((ok, ko) => sqlite.all(sql, (e: Error | null, r: unknown) => (e ? ko(e) : ok(r as T[]))))

const users = await all<Record<string, string | number | null>>('SELECT * FROM usuarios')
for (const u of users) {
  await pool.query(
    `INSERT INTO users (nombre, apellido, edad, telefono, compania, estado, colonia, correo, password_hash, rol)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING`,
    [u.nombre, u.apellido, u.edad, u.telefono, u.compania, u.estado, u.colonia, u.correo,
     await bcrypt.hash(String(u.password), 10), u.rol])
}
const reports = await all<Record<string, string>>('SELECT * FROM reportes')
for (const r of reports) {
  await pool.query(
    `INSERT INTO reports (user_id, sensor, description, status)
     SELECT id, $2, $3, $4 FROM users WHERE lower(correo) = lower($1)`,
    [r.usuario, r.sensor, r.descripcion, r.estado])
}
await pool.end()
console.log(`Migrados ${users.length} usuarios y ${reports.length} reportes`)