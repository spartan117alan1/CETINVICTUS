export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

export const api = async <T>(path: string, init: { method?: string; json?: unknown } = {}): Promise<T> => {
  const res = await fetch(`/api${path}`, {
    method: init.method ?? 'GET',
    credentials: 'same-origin',
    headers: init.json !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
  })
  if (res.status === 401 && !location.pathname.endsWith('login.html')) {
    location.href = 'login.html'
    throw new ApiError(401, 'No autenticado')
  }
  const data: unknown = res.status === 204 ? null : await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string } | null)?.error ?? res.statusText)
  return data as T
}