import { Chart, registerables, type ChartConfiguration } from 'chart.js'

Chart.register(...registerables)

export const make = (id: string, config: ChartConfiguration): Chart | null => {
  const canvas = document.getElementById(id) as HTMLCanvasElement | null
  return canvas ? new Chart(canvas, config) : null
}

export const fmtTime = (ms: number, range: string) =>
  new Date(ms).toLocaleString([], range === '7d' || range === '30d'
    ? { day: '2-digit', month: '2-digit', hour: '2-digit' }
    : { hour: '2-digit', minute: '2-digit' })