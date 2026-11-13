export type Scalar = number | string
export type Group = Record<string, Scalar>
export type RangeKey = '1h' | '6h' | '24h' | '7d' | '30d'

export interface NodeView {
  key: string; region: string; zone: string; deviceId: string
  kind: 'node' | 'gateway'; via: string | null
  online: boolean; lastSeen: number | null
  metrics: Group; sensors_health: Group; diagnostics: Group
  openAlerts: number
}

export interface MetricMeta {
  key: string; group: 'metrics' | 'sensors_health' | 'diagnostics'
  label: string; unit: string; decimals: number
  kind: 'number' | 'boolean' | 'status'
  healthKey?: string; detailKey?: string
}
export interface Threshold { node_key: string; metric: string; min_value: number | null; max_value: number | null; severity: string }
export interface Meta { catalog: MetricMeta[]; thresholds: Threshold[] }

export interface Alert {
  id: string; node_key: string; rule: string; metric: string | null
  severity: 'info' | 'warning' | 'critical'; message: string
  opened_at: string; closed_at: string | null; ack_at: string | null
}

export interface User {
  id: number; nombre: string; apellido: string; edad: number | null
  telefono: string | null; correo: string; compania: string | null
  estado: string | null; colonia: string | null
  rol: 'admin' | 'cliente'; is_root: boolean
}

export interface Report {
  id: number; created_at: string; node_key: string | null; sensor: string
  description: string; status: 'Pendiente' | 'Revisado'; usuario: string
}

export interface AlertEvent { state: 'opened' | 'closed'; alert: Alert }
export interface CommandEvent { nodeKey: string; id: number; command: string; value: 0 | 1; status: 'sent' | 'confirmed' | 'timeout' | 'failed' }

export interface HistoryPoint { t: number; avg: number; min: number; max: number }
export interface History { metric: string; bucket: string; points: HistoryPoint[] }
export interface SummaryRow { metric: string; avg: number; min: number; max: number; n: number; pct_in_range: number | null }
export interface Me { id: number; rol: 'admin' | 'cliente'; correo: string; nombre: string }