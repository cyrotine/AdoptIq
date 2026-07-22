import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import type { SubmitResponse } from '../lib/quiz'
import Shell, { Notice, Quiet, RailLink } from '../components/Shell'
import ResultSummary from '../components/ResultSummary'

export default function QuizReview() {
  const { quizId } = useParams()
  const [result, setResult] = useState<SubmitResponse | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!quizId) return
    api<SubmitResponse>(`/api/quiz/history/${quizId}`)
      .then(setResult)
      .catch((err: Error) => setError(err.message))
  }, [quizId])

  return (
    <Shell context="Past test" right={<RailLink to="/">Dashboard</RailLink>}>
      {error && <Notice>{error}</Notice>}
      {!result && !error && <Quiet>Loading this test…</Quiet>}
      {result && (
        <>
          <ResultSummary result={result} />
          <Link to="/" className="btn btn-solid mt-12 block py-3.5 text-center">
            Back to dashboard
          </Link>
        </>
      )}
    </Shell>
  )
}
