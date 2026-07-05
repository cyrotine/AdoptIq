import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, getToken, setToken, clearToken, type Student, type AuthResponse } from '../lib/api'

interface AuthState {
  student: Student | null
  loading: boolean // true while restoring the session on first load
  login: (identifier: string, password: string) => Promise<void>
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
  const [loading, setLoading] = useState(true)

  // Restore session from a stored token on first load.
  useEffect(() => {
    if (!getToken()) {
      setLoading(false)
      return
    }
    api<{ student: Student }>('/api/auth/me')
      .then(({ student }) => setStudent(student))
      .catch(() => clearToken())
      .finally(() => setLoading(false))
  }, [])

  const authenticate = (res: AuthResponse) => {
    setToken(res.token)
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
  }

  const refresh = async () => {
    const { student } = await api<{ student: Student }>('/api/auth/me')
    setStudent(student)
  }

  return (
    <AuthContext.Provider value={{ student, loading, login, register, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
