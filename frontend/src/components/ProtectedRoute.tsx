import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute() {
  const { student, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="eyebrow">Checking your session</span>
      </div>
    )
  }
  if (!student) return <Navigate to="/login" replace />
  return <Outlet />
}
