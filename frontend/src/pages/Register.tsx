import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { AuthCard, Choice, Field } from '../components/AuthForm'

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
      title="Get placed on the scale"
      standfirst="Two minutes to set up. Your first quiz is built around where you actually are."
      error={error}
      submitting={submitting}
      submitLabel="Create account"
      onSubmit={onSubmit}
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-signal underline underline-offset-4">
            Log in
          </Link>
        </>
      }
    >
      <Field label="Full name" name="name" required autoFocus maxLength={100} />
      <Field
        label="Username"
        name="username"
        required
        minLength={3}
        maxLength={30}
        pattern="[a-zA-Z0-9_]+"
        title="Letters, numbers and underscore only"
        hint="Letters, numbers and underscore · 3–30 characters"
      />
      <Field label="Email" name="email" type="email" required maxLength={100} />
      <Field
        label="Password"
        name="password"
        type="password"
        required
        minLength={8}
        hint="At least 8 characters"
      />
      <Choice label="Class" name="class" required>
        <option value="9">Class 9</option>
        <option value="10">Class 10</option>
      </Choice>
    </AuthCard>
  )
}
