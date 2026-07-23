import { Link, Navigate, useLocation } from 'react-router-dom'
import type { SubmitResponse } from '../lib/quiz'
import Shell, { RailLink } from '../components/Shell'
import ResultSummary from '../components/ResultSummary'

export default function Result() {
  const result = useLocation().state as SubmitResponse | null
  if (!result) return <Navigate to="/" replace />

  return (
    <Shell context="Result" right={<RailLink to="/">Dashboard</RailLink>}>
      <ResultSummary result={result} celebrate />
      <Link to="/" className="btn btn-solid mt-12 block py-3.5 text-center">
        Back to dashboard
      </Link>
    </Shell>
  )
}
