import { api, ApiError } from '../lib/api.js'
import { $ } from '../lib/dom.js'
import type { Me } from '../lib/types.js'

$<HTMLFormElement>('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault()
  const err = $('#login-error')
  try {
    await api<Me>('/auth/login', { method: 'POST', json: {
      correo: $<HTMLInputElement>('#email').value,
      password: $<HTMLInputElement>('#password').value,
    } })
    location.href = 'dashboard.html'
  } catch (x) {
    err.textContent = x instanceof ApiError ? x.message : 'No se pudo conectar con el servidor'
    err.classList.remove('d-none')
  }
})