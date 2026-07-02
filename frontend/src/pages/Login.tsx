import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { AuthCard, Field } from '../components/AuthForm'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setError(null)
    setSubmitting(true)
    try {
      await login(String(form.get('identifier')), String(form.get('password')))
      navigate('/')
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
      <Field label="Username or email" name="identifier" required autoFocus />
      <Field label="Password" name="password" type="password" required />
    </AuthCard>
  )
}
