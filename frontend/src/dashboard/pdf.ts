import { $ } from '../lib/dom.js'
import { selectedNode } from './state.js'

declare const html2pdf: any

export const initPdf = () => {
  $('#btn-pdf').addEventListener('click', async () => {
    const node = selectedNode()
    const name = `reporte-${node?.deviceId ?? 'nodo'}-${new Date().toISOString().slice(0, 10)}.pdf`

    await html2pdf().set({
      margin: 8, filename: name,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: {
        scale: 2, useCORS: true,
        onclone: (doc: Document) => {
          doc.querySelectorAll<HTMLElement>('#area-reporte *').forEach((e) => {
            if (getComputedStyle(e).backgroundImage.startsWith('url(')) e.style.backgroundImage = 'none'
          })
        },
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
      pagebreak: { mode: ['css', 'legacy'], avoid: ['.card'] },
    }).from($('#area-reporte')).save()
  })
}