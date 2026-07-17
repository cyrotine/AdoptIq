import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  api,
  getToken,
  setToken,
  getRole,
  setRole,
  clearToken,
  type Student,
  type AuthResponse,
  type Admin,
  type AdminAuthResponse,
} from '../lib/api'

interface AuthState {
  student: Student | null
  admin: Admin | null // spec 11 — set only when logged in as an admin
  loading: boolean // true while restoring the session on first load
  login: (identifier: string, password: string) => Promise<void>
  adminLogin: (username: string, password: string) => Promise<void>
  register: (input: {
    name: string
    username: string
    email: string
    password: string
    class: number
  }) => Promise<void>
  logout: () => void
  refresh: () => Promise<void> // re-fetch the student (e.g. after a quiz updates counters)
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [student, setStudent] = useState<Student | null>(null)
  const [admin, setAdmin] = useState<Admin | null>(null)
  const [loading, setLoading] = useState(true)

  // Restore session from a stored token on first load — branch on the stored
  // role so an admin token restores via the admin /me, not the student one.
  useEffect(() => {
    if (!getToken()) {
      setLoading(false)
      return
    }
    const restore =
      getRole() === 'admin'
        ? api<{ admin: Admin }>('/api/auth/admin/me').then(({ admin }) => setAdmin(admin))
        : api<{ student: Student }>('/api/auth/me').then(({ student }) => setStudent(student))
    restore.catch(() => clearToken()).finally(() => setLoading(false))
  }, [])

  const authenticate = (res: AuthResponse) => {
    setToken(res.token)
    setRole('student')
    setStudent(res.student)
  }

  const login = async (identifier: string, password: string) => {
    authenticate(
      await api<AuthResponse>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier, password }),
      }),
    )
  }

  const adminLogin = async (username: string, password: string) => {
    const res = await api<AdminAuthResponse>('/api/auth/admin/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    })
    setToken(res.token)
    setRole('admin')
    setAdmin(res.admin)
  }

  const register = async (input: {
    name: string
    username: string
    email: string
    password: string
    class: number
  }) => {
    authenticate(
      await api<AuthResponse>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    )
  }

  const logout = () => {
    clearToken()
    setStudent(null)
    setAdmin(null)
  }

  const refresh = async () => {
    const { student } = await api<{ student: Student }>('/api/auth/me')
    setStudent(student)
  }

  return (
    <AuthContext.Provider
      value={{ student, admin, loading, login, adminLogin, register, logout, refresh }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
