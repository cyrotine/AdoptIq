import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { AuthCard, Field } from '../components/AuthForm'

export default function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setError(null)
    setSubmitting(true)
    try {
      await register({
        name: String(form.get('name')),
        username: String(form.get('username')),
        email: String(form.get('email')),
        password: String(form.get('password')),
        class: Number(form.get('class')),
      })
      navigate('/onboarding')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'registration failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthCard
      title="Create your account"
      error={error}
      submitting={submitting}
      submitLabel="Register"
      onSubmit={onSubmit}
      footer={
        <>
          Already have an account? <Link to="/login" className="text-indigo-600 hover:underline">Log in</Link>
        </>
      }
    >
      <Field label="Full name" name="name" required autoFocus maxLength={100} />
      <Field label="Username" name="username" required minLength={3} maxLength={30} pattern="[a-zA-Z0-9_]+" title="Letters, numbers and underscore only" />
      <Field label="Email" name="email" type="email" required maxLength={100} />
      <Field label="Password" name="password" type="password" required minLength={8} />
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">Class</span>
        <select
          name="class"
          required
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        >
          <option value="9">Class 9</option>
          <option value="10">Class 10</option>
        </select>
      </label>
    </AuthCard>
  )
}
