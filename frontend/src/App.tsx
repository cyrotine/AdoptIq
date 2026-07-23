import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import AdminRoute from './components/AdminRoute'
import Welcome from './pages/Welcome'
import Login from './pages/Login'
import Register from './pages/Register'
import Onboarding from './pages/Onboarding'
import Dashboard from './pages/Dashboard'
import Quiz from './pages/Quiz'
import Result from './pages/Result'
import QuizReview from './pages/QuizReview'

// The admin surface is code-split out of the student path (spec 16 —
// presentational split only; the route table is unchanged).
const AdminPanel = lazy(() => import('./pages/AdminPanel'))
const GenerationWorkspace = lazy(() => import('./pages/GenerationWorkspace'))

const loading = (
  <div className="flex min-h-screen items-center justify-center">
    <span className="eyebrow">Loading…</span>
  </div>
)

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/welcome" element={<Welcome />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/" element={<Dashboard />} />
            <Route path="/quiz" element={<Quiz />} />
            <Route path="/result" element={<Result />} />
            <Route path="/quiz/:quizId/review" element={<QuizReview />} />
          </Route>
          <Route element={<AdminRoute />}>
            <Route
              path="/admin"
              element={
                <Suspense fallback={loading}>
                  <AdminPanel />
                </Suspense>
              }
            />
            <Route
              path="/admin/generate/:topicId"
              element={
                <Suspense fallback={loading}>
                  <GenerationWorkspace />
                </Suspense>
              }
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
