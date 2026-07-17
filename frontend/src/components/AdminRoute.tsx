import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// Spec 11 — client-side gate for /admin. The real security boundary is the
// requireAdmin middleware on the API; this only controls what renders.
export default function AdminRoute() {
  const { admin, loading } = useAuth()

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-gray-500">Loading…</div>
  }
  if (!admin) return <Navigate to="/login" replace />
  return <Outlet />
}
