import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Wordmark } from './Shell'

export default function ProtectedRoute() {
  const { student, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-5">
        <Wordmark />
        <span className="eyebrow">Checking your session</span>
      </div>
    )
  }
  if (!student) return <Navigate to="/login" replace />
  return <Outlet />
}
