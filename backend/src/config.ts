const need = (name: string): string => {
  const v = process.env[name]
  if (!v) throw new Error(`Falta la variable de entorno ${name}`)
  return v
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: need('DATABASE_URL'),
  jwtSecret: need('JWT_SECRET'),
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  staticDir: process.env.STATIC_DIR,
  mqtt: {
    url: process.env.MQTT_URL ?? 'mqtt://localhost:1883',
    org: process.env.MQTT_ORG ?? 'hackathon',
  },
  persistEveryMs: 10_000,
  persistSlowEveryMs: 60_000,
  offlineAfterMs: 20_000,
  commandTimeoutMs: 10_000,
  sseKeepAliveMs: 25_000,
} as const