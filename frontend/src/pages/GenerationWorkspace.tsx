// Spec 14 — Generation Workspace. Upload a topic's notes -> get transient AI
// candidates -> review each (Accept publishes to the question bank, Reject
// discards locally) -> Finish the session. Candidates live only in React state;
// only accepted ones are ever stored (as a permanent question + a link row).
import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  acceptCandidate,
  chat,
  createSession,
  finishSession,
  generateMore,
  type Candidate,
  type ChatMessage,
  type GenerationSession,
} from '../lib/api'

// Per-card review outcome. Candidates have no id, so we key status by index.
type CardStatus = 'pending' | 'accepting' | 'published' | 'duplicate' | 'rejected'

const LETTERS = ['A', 'B', 'C', 'D'] as const

export default function GenerationWorkspace() {
  const { admin } = useAuth()
  const navigate = useNavigate()
  const { topicId } = useParams()
  // Topic name is passed by the Generate button; fall back to the id.
  const topicName =
    (useLocation().state as { topicName?: string } | null)?.topicName ?? `Topic ${topicId}`

  const [session, setSession] = useState<GenerationSession | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [status, setStatus] = useState<Record<number, CardStatus>>({})
  const [error, setError] = useState('')
  const [generating, setGenerating] = useState(false)
  const [finished, setFinished] = useState(false)

  // Spec 15 — Generate More + grounded chat, both only while the session is active.
  const [moreCount, setMoreCount] = useState(5)
  const [moreElo, setMoreElo] = useState('') // '' -> reuse the session's target Elo
  const [generatingMore, setGeneratingMore] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatting, setChatting] = useState(false)

  if (!admin) return null // AdminRoute guarantees admin; satisfy TS

  const onGenerate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!topicId) return
    setError('')
    setGenerating(true)
    const form = e.currentTarget
    const data = new FormData(form)
    data.set('topic_id', topicId) // authoritative; the file input carries the rest
    try {
      const { session: s, candidates: c } = await createSession(data)
      setSession(s)
      setCandidates(c)
      setStatus({})
    } catch (err) {
      setError(err instanceof Error ? err.message : 'generation failed')
    } finally {
      setGenerating(false)
    }
  }

  const onAccept = async (index: number) => {
    if (!session) return
    setStatus((s) => ({ ...s, [index]: 'accepting' }))
    try {
      await acceptCandidate(session.session_id, candidates[index])
      setStatus((s) => ({ ...s, [index]: 'published' }))
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      // The backend returns 409 { error: 'duplicate' } for an existing question.
      if (msg === 'duplicate') setStatus((s) => ({ ...s, [index]: 'duplicate' }))
      else {
        setStatus((s) => ({ ...s, [index]: 'pending' }))
        setError(msg || 'accept failed')
      }
    }
  }

  const onReject = (index: number) => {
    // Client-side only — no request, nothing stored.
    setStatus((s) => ({ ...s, [index]: 'rejected' }))
  }

  const onFinish = async () => {
    if (!session) return
    try {
      await finishSession(session.session_id)
      setFinished(true)
      // Show the "questions saved" confirmation briefly, then redirect to admin.
      setTimeout(() => navigate('/admin'), 1200)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'save failed')
    }
  }

  // Both iterative actions APPEND to the same candidates array so the index-keyed
  // status map stays valid (new candidates default to 'pending').
  const onGenerateMore = async () => {
    if (!session) return
    setError('')
    setGeneratingMore(true)
    try {
      const { candidates: c } = await generateMore(session.session_id, {
        count: moreCount,
        targetElo: moreElo === '' ? undefined : Number(moreElo),
      })
      setCandidates((cs) => [...cs, ...c])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'generate more failed')
    } finally {
      setGeneratingMore(false)
    }
  }

  const onSendChat = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!session || !chatInput.trim()) return
    setError('')
    const next: ChatMessage[] = [...messages, { role: 'user', content: chatInput.trim() }]
    setMessages(next)
    setChatInput('')
    setChatting(true)
    try {
      const { reply, candidates: c } = await chat(session.session_id, next)
      setMessages((m) => [...m, { role: 'assistant', content: reply }])
      if (c.length) setCandidates((cs) => [...cs, ...c])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'chat failed')
    } finally {
      setChatting(false)
    }
  }

  const visibleCandidates = candidates
    .map((c, i) => ({ c, i }))
    .filter(({ i }) => status[i] !== 'rejected')

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="flex items-center justify-between bg-white px-6 py-4 shadow-sm">
        <span className="text-lg font-bold text-indigo-600">AdaptIQ · Generate</span>
        <Link to="/admin" className="text-sm text-gray-500 hover:text-gray-900">
          Back to Admin
        </Link>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="text-2xl font-bold text-gray-900">{topicName}</h1>
        <p className="mt-2 text-gray-600">
          Upload the topic's notes, then review each AI candidate. Accept publishes it
          to the question bank; Reject discards it.
        </p>

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
        )}

        {/* Upload form — hidden once a session has been created. */}
        {!session && (
          <form onSubmit={onGenerate} className="mt-6 space-y-4 rounded-lg bg-white p-6 shadow">
            <div>
              <label className="block text-sm font-medium text-gray-700">Notes file</label>
              <input
                type="file"
                name="file"
                accept=".pdf,.txt,.md"
                required
                className="mt-1 w-full text-sm text-gray-700"
              />
              <p className="mt-1 text-xs text-gray-400">.pdf, .txt, or .md</p>
            </div>
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700">Target Elo (0–100)</label>
                <input
                  type="number"
                  name="target_elo"
                  min={0}
                  max={100}
                  defaultValue={50}
                  required
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700">Count (1–20)</label>
                <input
                  type="number"
                  name="count"
                  min={1}
                  max={20}
                  defaultValue={5}
                  required
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={generating}
              className="w-full rounded-lg bg-indigo-600 py-3 font-semibold text-white shadow hover:bg-indigo-700 disabled:opacity-50"
            >
              {generating ? 'Generating…' : 'Generate candidates'}
            </button>
          </form>
        )}

        {/* Empty state — session created but the model returned nothing usable. */}
        {session && candidates.length === 0 && (
          <p className="mt-6 text-sm text-gray-500">
            No candidates generated — try a different file or count.
          </p>
        )}

        {/* Review cards. */}
        {visibleCandidates.map(({ c, i }) => {
          const st = status[i] ?? 'pending'
          return (
            <div key={i} className="mt-4 rounded-lg bg-white p-6 shadow">
              <div className="flex items-start justify-between gap-4">
                <p className="font-medium text-gray-900">{c.question_text}</p>
                <span className="shrink-0 text-xs text-gray-400">Elo {c.elo_question}</span>
              </div>
              <ul className="mt-3 space-y-1 text-sm">
                {LETTERS.map((letter) => {
                  const isCorrect = c.correct_answer === letter
                  return (
                    <li
                      key={letter}
                      className={isCorrect ? 'font-semibold text-green-700' : 'text-gray-700'}
                    >
                      {letter}. {c[`option_${letter.toLowerCase()}` as keyof Candidate] as string}
                      {isCorrect && ' ✓'}
                    </li>
                  )
                })}
              </ul>
              <p className="mt-3 text-sm text-gray-500">{c.explanation}</p>

              <div className="mt-4 flex items-center gap-3">
                {st === 'published' && (
                  <span className="text-sm font-semibold text-green-700">Published ✓</span>
                )}
                {st === 'duplicate' && (
                  <span className="text-sm font-semibold text-amber-600">
                    Duplicate — already in the bank
                  </span>
                )}
                {(st === 'pending' || st === 'accepting') && (
                  <>
                    <button
                      onClick={() => onAccept(i)}
                      disabled={st === 'accepting'}
                      className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white shadow hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {st === 'accepting' ? 'Accepting…' : 'Accept'}
                    </button>
                    <button
                      onClick={() => onReject(i)}
                      disabled={st === 'accepting'}
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </>
                )}
              </div>
            </div>
          )
        })}

        {/* Spec 15 — iterative controls, only while the session is active. */}
        {session && !finished && (
          <>
            {/* Generate More — another batch, steered by accepted questions. */}
            <div className="mt-6 rounded-lg bg-white p-6 shadow">
              <h2 className="font-semibold text-gray-900">Generate more</h2>
              <p className="mt-1 text-sm text-gray-500">
                Another batch from the same notes, steered by the questions you've accepted.
              </p>
              <div className="mt-3 flex items-end gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700">Count (1–20)</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={moreCount}
                    onChange={(e) => setMoreCount(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700">
                    Target Elo (optional)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={moreElo}
                    placeholder={String(session.target_elo)}
                    onChange={(e) => setMoreElo(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <button
                  onClick={onGenerateMore}
                  disabled={generatingMore}
                  className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white shadow hover:bg-indigo-700 disabled:opacity-50"
                >
                  {generatingMore ? 'Generating…' : 'Generate more'}
                </button>
              </div>
            </div>

            {/* Chat — grounded in the uploaded notes; can also author questions. */}
            <div className="mt-6 rounded-lg bg-white p-6 shadow">
              <h2 className="font-semibold text-gray-900">Chat about these notes</h2>
              <p className="mt-1 text-sm text-gray-500">
                Ask about the notes, or ask for questions (e.g. "give me 3 harder ones on X").
              </p>
              {messages.length > 0 && (
                <div className="mt-3 space-y-2">
                  {messages.map((m, i) => (
                    <p
                      key={i}
                      className={
                        m.role === 'user'
                          ? 'rounded-lg bg-indigo-50 p-3 text-sm text-gray-800'
                          : 'rounded-lg bg-gray-50 p-3 text-sm text-gray-700'
                      }
                    >
                      <span className="font-semibold">{m.role === 'user' ? 'You' : 'AI'}: </span>
                      {m.content}
                    </p>
                  ))}
                </div>
              )}
              <form onSubmit={onSendChat} className="mt-3 flex gap-3">
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Ask about the notes…"
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={chatting || !chatInput.trim()}
                  className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white shadow hover:bg-indigo-700 disabled:opacity-50"
                >
                  {chatting ? 'Sending…' : 'Send'}
                </button>
              </form>
            </div>

            <button
              onClick={onFinish}
              className="mt-6 w-full rounded-lg border border-gray-300 py-3 font-semibold text-gray-700 hover:bg-gray-50"
            >
              Save session
            </button>
          </>
        )}
        {finished && (
          <p className="mt-6 rounded-lg bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
            Questions saved — redirecting to dashboard…
          </p>
        )}
      </main>
    </div>
  )
}
