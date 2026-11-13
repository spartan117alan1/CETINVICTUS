import { api, ApiError } from '../lib/api.js'
import { $, el } from '../lib/dom.js'
import type { Me, User } from '../lib/types.js'

declare const bootstrap: { Modal: { getOrCreateInstance(e: Element): { show(): void; hide(): void } } }

const me = await api<Me>('/auth/me')
if (me.rol !== 'admin') { location.href = 'dashboard.html'; throw new Error('Solo administradores') }

$('#user-info-badge').replaceChildren('👤 ', me.nombre, ' | Rol: ', el('span', 'text-warning', 'Administrador'))
$('#btn-salir').addEventListener('click', async () => {
  await api('/auth/logout', { method: 'POST' })
  location.href = 'login.html'
})

const FIELDS = {
  '#nuevoNombre': 'nombre', '#nuevoApellido': 'apellido', '#nuevoCorreo': 'correo', '#nuevoEdad': 'edad',
  '#nuevoTelefono': 'telefono', '#nuevoCompania': 'compania', '#nuevoEstado': 'estado', '#nuevoColonia': 'colonia',
} as const
const text = (id: string) => $<HTMLInputElement>(id).value.trim()
const orNull = (s: string) => (s === '' ? null : s)
const modal = () => bootstrap.Modal.getOrCreateInstance($('#modalNuevoUsuario'))

let users: User[] = []
let editing: User | null = null

const openForm = (u: User | null) => {
  editing = u
  $<HTMLFormElement>('#formNuevoUsuario').reset()
  $('#nuevo-error').classList.add('d-none')
  $('#modalTitulo').textContent = u ? 'Editar Usuario' : 'Crear Nuevo Usuario'
  $('#btnGuardarUsuario').textContent = u ? 'Guardar cambios' : 'Crear usuario'
  $<HTMLInputElement>('#nuevoPassword').required = !u
  if (!u) return
  for (const [id, k] of Object.entries(FIELDS)) $<HTMLInputElement>(id).value = String(u[k] ?? '')
  $<HTMLSelectElement>('#nuevoRol').value = u.rol
}

const row = (u: User): HTMLElement => {
  const tr = el('tr')
  const rol = el('td')
  rol.append(el('span', `badge ${u.rol === 'admin' ? 'bg-warning text-dark' : 'bg-secondary'}`,
    u.rol === 'admin' ? 'Administrador' : 'Cliente'))
  const act = el('td', 'text-center')
  const edit = el('button', 'btn btn-sm btn-outline-primary me-1', 'Editar')
  edit.addEventListener('click', () => { openForm(u); modal().show() })
  act.append(edit)
  if (u.id !== me.id && !u.is_root) {
    const del = el('button', 'btn btn-sm btn-outline-danger', 'Eliminar')
    del.addEventListener('click', async () => {
      if (!confirm(`¿Eliminar a ${u.correo}?`)) return
      try { await api(`/users/${u.id}`, { method: 'DELETE' }); await load() }
      catch (e) { alert((e as Error).message) }
    })
    act.append(del)
  }
  tr.append(el('td', '', String(u.id)), el('td', '', `${u.nombre} ${u.apellido}`),
    el('td', '', u.correo), el('td', '', u.telefono ?? '—'), rol, act)
  return tr
}

const render = () => {
  const q = text('#inputBuscador').toLowerCase()
  $('#tabla-usuarios').replaceChildren(...users.filter((u) => u.correo.toLowerCase().includes(q)).map(row))
}
const load = async () => { users = await api<User[]>('/users'); render() }

$('#inputBuscador').addEventListener('input', render)
$('[data-bs-target="#modalNuevoUsuario"]').addEventListener('click', () => openForm(null))

$<HTMLFormElement>('#formNuevoUsuario').addEventListener('submit', async (e) => {
  e.preventDefault()
  const err = $('#nuevo-error')
  err.classList.add('d-none')
  const edad = text('#nuevoEdad')
  const body = {
    rol: $<HTMLSelectElement>('#nuevoRol').value,
    nombre: text('#nuevoNombre'), apellido: text('#nuevoApellido'), correo: text('#nuevoCorreo'),
    edad: edad === '' ? null : Number(edad),
    telefono: orNull(text('#nuevoTelefono')), compania: orNull(text('#nuevoCompania')),
    estado: orNull(text('#nuevoEstado')), colonia: orNull(text('#nuevoColonia')),
    password: $<HTMLInputElement>('#nuevoPassword').value || undefined,
  }
  try {
    if (editing) await api(`/users/${editing.id}`, { method: 'PUT', json: body })
    else await api('/users', { method: 'POST', json: body })
    modal().hide()
    await load()
  } catch (x) {
    err.textContent = x instanceof ApiError ? x.message : 'No se pudo conectar con el servidor'
    err.classList.remove('d-none')
  }
})

await load()