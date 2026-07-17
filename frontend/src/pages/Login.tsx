import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { AuthCard, Field } from '../components/AuthForm'

export default function Login() {
  const { login, adminLogin } = useAuth()
  const navigate = useNavigate()
  const [role, setRole] = useState<'student' | 'admin'>('student')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const identifier = String(form.get('identifier'))
    const password = String(form.get('password'))
    setError(null)
    setSubmitting(true)
    try {
      if (role === 'admin') {
        await adminLogin(identifier, password)
        navigate('/admin')
      } else {
        await login(identifier, password)
        navigate('/')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'login failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthCard
      title="Log in to AdaptIQ"
      error={error}
      submitting={submitting}
      submitLabel="Log in"
      onSubmit={onSubmit}
      footer={
        <>
          New here? <Link to="/register" className="text-indigo-600 hover:underline">Create an account</Link>
        </>
      }
    >
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">Log in as</span>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as 'student' | 'admin')}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        >
          <option value="student">Student</option>
          <option value="admin">Admin</option>
        </select>
      </label>
      <Field label="Username or email" name="identifier" required autoFocus />
      <Field label="Password" name="password" type="password" required />
    </AuthCard>
  )
}
