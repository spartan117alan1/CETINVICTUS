export type Scalar = number | string
export type Group = Record<string, Scalar>
export type GroupName = 'metrics' | 'sensors_health' | 'diagnostics'
export const GROUPS: GroupName[] = ['metrics', 'sensors_health', 'diagnostics']

export interface Telemetry {
  ts: number
  via?: string
  metrics: Group
  sensors_health: Group
  diagnostics: Group
}

export interface NodeRef {
  key: string
  region: string
  zone: string
  deviceId: string
}

export interface NodeView extends NodeRef {
  kind: 'node' | 'gateway'
  via: string | null
  online: boolean
  lastSeen: number | null
  metrics: Group
  sensors_health: Group
  diagnostics: Group
  openAlerts: number
}