// Minimal fetch wrapper: JSON in/out, Bearer token from localStorage,
// throws Error(message) using the backend's { error } shape.

export interface Student {
  student_id: string
  name: string
  username: string
  email: string
  class: number
  total_quizzes: number
  correct_answers: number
}

export interface AuthResponse {
  token: string
  student: Student
}

const TOKEN_KEY = 'adaptiq_token'

export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const setToken = (token: string) => localStorage.setItem(TOKEN_KEY, token)
export const clearToken = () => localStorage.removeItem(TOKEN_KEY)

// Spec 08 — seed post-registration mastery baseline. Payload is one of:
//   { mode: 'skip' } | { mode: 'manual', elo } | { mode: 'probe', subjects }
export type BaselinePayload =
  | { mode: 'skip' }
  | { mode: 'manual'; elo: number }
  | { mode: 'probe'; subjects: Record<string, { marks?: string; areas?: Record<string, number> }> }

export const seedBaseline = (payload: BaselinePayload) =>
  api<{ seeded: number }>('/api/mastery/baseline', {
    method: 'POST',
    body: JSON.stringify(payload),
  })

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? `request failed (${res.status})`)
  return body as T
}
