import type { Group, GroupName } from '../types.js'

export interface MetricMeta {
  key: string
  group: GroupName
  label: string
  unit: string
  decimals: number
  kind: 'number' | 'boolean' | 'status'
  healthKey?: string
  detailKey?: string
  noiseFloor?: number
  flatlineMs?: number
}

const M = (key: string, group: GroupName, label: string, unit: string, decimals: number,
           extra: Partial<MetricMeta> = {}): MetricMeta =>
  ({ key, group, label, unit, decimals, kind: 'number', ...extra })

const S = (key: string, label: string, detailKey?: string): MetricMeta =>
  ({ key, group: 'sensors_health', label, unit: '', decimals: 0, kind: 'status', detailKey })

const FLAT = 10 * 60_000

export const CATALOG: MetricMeta[] = [
  M('ph', 'metrics', 'pH', '', 2, { healthKey: 'ph_status', noiseFloor: 0.05, flatlineMs: FLAT }),
  M('turbidity_ntu', 'metrics', 'Turbidez', 'NTU', 1, { healthKey: 'turbidity_status', noiseFloor: 0.3, flatlineMs: FLAT }),
  M('conductivity_tds', 'metrics', 'TDS', 'mg/L', 0, { healthKey: 'tds_status', noiseFloor: 5, flatlineMs: FLAT }),
  M('water_temp_c', 'metrics', 'Temp. del agua', '°C', 1, { noiseFloor: 0.2 }),
  M('flow_lpm', 'metrics', 'Caudal', 'L/min', 1, { noiseFloor: 0.2 }),
  M('flow_total_l', 'metrics', 'Volumen acumulado', 'L', 0),
  M('gas_ppm_co2eq', 'metrics', 'Gas (CO₂eq)', 'ppm', 0, { healthKey: 'gas_status', noiseFloor: 5 }),
  { key: 'object_detected', group: 'metrics', label: 'Nivel de agua', unit: '', decimals: 0, kind: 'boolean' },
  { key: 'led', group: 'metrics', label: 'LED', unit: '', decimals: 0, kind: 'boolean' },
  S('ph_status', 'Sensor de pH', 'ph_electrode_mv'),
  S('turbidity_status', 'Sensor de turbidez', 'turbidity_voltage_mv'),
  S('tds_status', 'Sensor de TDS', 'tds_voltage_mv'),
  S('gas_status', 'Sensor de gas', 'gas_voltage_mv'),
  S('air_sensor_status', 'Sensor de aire'),
  M('ph_electrode_mv', 'sensors_health', 'Electrodo pH', 'mV', 1),
  M('turbidity_voltage_mv', 'sensors_health', 'Voltaje turbidez', 'mV', 0),
  M('turbidity_lens_cleanliness_pct', 'sensors_health', 'Limpieza del lente', '%', 0),
  M('tds_voltage_mv', 'sensors_health', 'Voltaje TDS', 'mV', 0),
  M('gas_voltage_mv', 'sensors_health', 'Voltaje gas', 'mV', 0),
  M('battery_v', 'diagnostics', 'Batería', 'V', 2),
  M('rssi_dbm', 'diagnostics', 'Señal (RSSI)', 'dBm', 0),
  M('free_heap_bytes', 'diagnostics', 'Heap libre', 'B', 0),
  M('uptime_s', 'diagnostics', 'Tiempo activo', 's', 0),
]

export const metaOf = (key: string): MetricMeta | undefined => CATALOG.find((m) => m.key === key)
export const labelOf = (key: string): string => metaOf(key)?.label ?? key

/** ¿El sensor que produce esta medida está sano? Sin estado reportado, asumimos que sí. */
export const isHealthy = (health: Group, healthKey?: string): boolean =>
  !healthKey || health[healthKey] === undefined || health[healthKey] === 'OK'