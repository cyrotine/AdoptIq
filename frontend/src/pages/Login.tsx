import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useReducedMotion } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { AuthCard, CalibrationOverlay, Choice, Field } from '../components/AuthForm'

export default function Login() {
  const { login, adminLogin } = useAuth()
  const navigate = useNavigate()
  const reduce = useReducedMotion()
  const [role, setRole] = useState<'student' | 'admin'>('student')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [calibrating, setCalibrating] = useState<string | null>(null)

  // Post-login moment: same destination, a ~800ms presentational pause
  // (skipped under reduced motion) before the unchanged navigate fires.
  const arrive = (to: string, message: string) => {
    if (reduce) {
      navigate(to)
      return
    }
    setCalibrating(message)
    setTimeout(() => navigate(to), 800)
  }

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
        arrive('/admin', 'Preparing your workspace…')
      } else {
        await login(identifier, password)
        arrive('/', 'Calibrating your learning profile…')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'login failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      {calibrating && <CalibrationOverlay message={calibrating} />}
      <AuthCard
        title="Welcome back"
        standfirst="Pick up where your rating left off."
        error={error}
        submitting={submitting}
        submitLabel="Log in"
        onSubmit={onSubmit}
        footer={
          <>
            New here?{' '}
            <Link to="/register" className="font-medium text-signal underline underline-offset-4">
              Create an account
            </Link>
          </>
        }
      >
        <Choice
          label="Log in as"
          value={role}
          onChange={(e) => setRole(e.target.value as 'student' | 'admin')}
        >
          <option value="student">Student</option>
          <option value="admin">Admin</option>
        </Choice>
        <Field label="Username or email" name="identifier" required autoFocus />
        <Field label="Password" name="password" type="password" required />
      </AuthCard>
    </>
  )
}
