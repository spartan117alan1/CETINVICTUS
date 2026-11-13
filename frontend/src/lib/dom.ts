export const $ = <T extends HTMLElement>(sel: string): T => {
  const e = document.querySelector<T>(sel)
  if (!e) throw new Error(`No existe ${sel}`)
  return e
}

export const el = (tag: string, cls = '', text?: string): HTMLElement => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text !== undefined) e.textContent = text      // nunca innerHTML con datos de usuarios
  return e
}

export class Emitter<T> {
  private fns = new Set<(v: T) => void>()
  on(fn: (v: T) => void) { this.fns.add(fn) }
  emit(v: T) { this.fns.forEach((f) => f(v)) }
}