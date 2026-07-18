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

// Spec 11 — admin identity, separate from students.
export interface Admin {
  admin_id: string
  username: string
}

export interface AdminAuthResponse {
  token: string
  admin: Admin
}

export type Role = 'student' | 'admin'

const TOKEN_KEY = 'adaptiq_token'
const ROLE_KEY = 'adaptiq_role'

export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const setToken = (token: string) => localStorage.setItem(TOKEN_KEY, token)
// Which identity the stored token belongs to, so a cold reload restores the
// right session (student /me vs admin /me).
export const getRole = () => localStorage.getItem(ROLE_KEY) as Role | null
export const setRole = (role: Role) => localStorage.setItem(ROLE_KEY, role)

export const clearToken = () => {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(ROLE_KEY)
}

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

// Multipart variant: send FormData with only the Bearer token. We must NOT set
// Content-Type — the browser sets the multipart boundary itself (the JSON api()
// hardcodes application/json and can't do multipart).
export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const token = getToken()
  const res = await fetch(path, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? `request failed (${res.status})`)
  return body as T
}

// Spec 12/14 — a transient generated candidate (held in the browser, stored only
// if accepted). Shape mirrors validateGeneratedQuestion on the backend.
export interface Candidate {
  question_text: string
  option_a: string
  option_b: string
  option_c: string
  option_d: string
  correct_answer: 'A' | 'B' | 'C' | 'D'
  explanation: string
  elo_question: number
  estimated_time: number
}

export interface GenerationSession {
  session_id: string
  topic_id: number
  target_elo: number
  status: 'active' | 'finished'
}

export interface CreateSessionResponse {
  session: GenerationSession
  candidates: Candidate[]
  summary: { requested: number; generated: number; valid: number; invalid: number }
}

// Spec 13 create-session (multipart). formData carries file, topic_id, target_elo, count.
export const createSession = (formData: FormData) =>
  apiUpload<CreateSessionResponse>('/api/admin/sessions', formData)

// Spec 14 accept — publishes the full candidate into the permanent question bank.
export const acceptCandidate = (sessionId: string, candidate: Candidate) =>
  api<{ question: Candidate & { question_id: string } }>(
    `/api/admin/sessions/${sessionId}/accept`,
    { method: 'POST', body: JSON.stringify(candidate) },
  )

export const finishSession = (sessionId: string) =>
  api<{ session: GenerationSession }>(`/api/admin/sessions/${sessionId}/finish`, {
    method: 'POST',
  })
