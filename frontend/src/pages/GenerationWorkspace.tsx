// Spec 14 — Generation Workspace. Upload a topic's notes -> get transient AI
// candidates -> review each (Accept publishes to the question bank, Reject
// discards locally) -> Finish the session. Candidates live only in React state;
// only accepted ones are ever stored (as a permanent question + a link row).
import { useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, CheckCircle2, Sparkles, UploadCloud, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import Shell, { Notice, PageHead, Quiet, RailLink, SectionHead } from '../components/Shell'
import { Skeleton } from '../components/ui'
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

// Per-card review outcome.
type CardStatus = 'pending' | 'accepting' | 'published' | 'duplicate' | 'rejected'

// Candidates have no server id until they are accepted, and they now live in two
// places — the batch list and inside chat turns — so each gets a local id on
// arrival. Status is keyed by that id, never by position.
type Reviewed = { id: number; candidate: Candidate }

// A chat turn. Assistant turns carry any questions that turn produced, so they
// render under the reply that asked for them instead of joining the batch above.
type Turn = ChatMessage & { items?: Reviewed[] }

const LETTERS = ['A', 'B', 'C', 'D'] as const

export default function GenerationWorkspace() {
  const { admin } = useAuth()
  const navigate = useNavigate()
  const { topicId } = useParams()
  // Topic name is passed by the Generate button; fall back to the id.
  const topicName =
    (useLocation().state as { topicName?: string } | null)?.topicName ?? `Topic ${topicId}`

  const [session, setSession] = useState<GenerationSession | null>(null)
  const [candidates, setCandidates] = useState<Reviewed[]>([])
  const [status, setStatus] = useState<Record<number, CardStatus>>({})
  const [error, setError] = useState('')
  const [generating, setGenerating] = useState(false)
  const [finished, setFinished] = useState(false)

  // Display-only: the chosen file's name inside the drop-zone.
  const [fileName, setFileName] = useState('')

  // Spec 15 — Generate More + grounded chat, both only while the session is active.
  const [moreCount, setMoreCount] = useState(5)
  const [moreElo, setMoreElo] = useState('') // '' -> reuse the session's target Elo
  const [generatingMore, setGeneratingMore] = useState(false)
  const [messages, setMessages] = useState<Turn[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatting, setChatting] = useState(false)

  // Monotonic local ids. A ref, so tagging never depends on render order.
  const nextId = useRef(0)
  const tag = (cs: Candidate[]): Reviewed[] =>
    cs.map((candidate) => ({ id: nextId.current++, candidate }))

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
      setCandidates(tag(c))
      setStatus({})
    } catch (err) {
      setError(err instanceof Error ? err.message : 'generation failed')
    } finally {
      setGenerating(false)
    }
  }

  const onAccept = async ({ id, candidate }: Reviewed) => {
    if (!session) return
    setStatus((s) => ({ ...s, [id]: 'accepting' }))
    try {
      await acceptCandidate(session.session_id, candidate)
      setStatus((s) => ({ ...s, [id]: 'published' }))
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      // The backend returns 409 { error: 'duplicate' } for an existing question.
      if (msg === 'duplicate') setStatus((s) => ({ ...s, [id]: 'duplicate' }))
      else {
        setStatus((s) => ({ ...s, [id]: 'pending' }))
        setError(msg || 'accept failed')
      }
    }
  }

  const onReject = ({ id }: Reviewed) => {
    // Client-side only — no request, nothing stored.
    setStatus((s) => ({ ...s, [id]: 'rejected' }))
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

  // Generate More extends the batch above; chat questions stay in the thread.
  const onGenerateMore = async () => {
    if (!session) return
    setError('')
    setGeneratingMore(true)
    try {
      const { candidates: c } = await generateMore(session.session_id, {
        count: moreCount,
        targetElo: moreElo === '' ? undefined : Number(moreElo),
      })
      setCandidates((cs) => [...cs, ...tag(c)])
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
    const next: Turn[] = [...messages, { role: 'user', content: chatInput.trim() }]
    setMessages(next)
    setChatInput('')
    setChatting(true)
    try {
      // The API takes the plain transcript — local ids and items never go over.
      const { reply, candidates: c } = await chat(
        session.session_id,
        next.map(({ role, content }) => ({ role, content })),
      )
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: reply, items: c.length ? tag(c) : undefined },
      ])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'chat failed')
    } finally {
      setChatting(false)
    }
  }

  const visible = (items: Reviewed[]) => items.filter((r) => status[r.id] !== 'rejected')
  const visibleCandidates = visible(candidates)

  const published = Object.values(status).filter((s) => s === 'published').length

  return (
    <Shell context="Generate" right={<RailLink to="/admin">Admin</RailLink>}>
      <PageHead
        title={topicName}
        note="Upload the topic's notes, then review each candidate. Accepting publishes it to the question bank; rejecting drops it here and nowhere else."
      />

      {error && (
        <div className="mt-6">
          <Notice>{error}</Notice>
        </div>
      )}

      {/* Upload form — hidden once a session has been created. */}
      {!session && (
        <form onSubmit={onGenerate} className="mt-10 space-y-6">
          <label className="pane flex cursor-pointer flex-col items-center gap-3 !border-dashed px-6 py-10 text-center transition-colors duration-150 focus-within:!border-signal hover:!border-signal/50">
            <UploadCloud aria-hidden size={28} strokeWidth={1.5} className="text-signal" />
            <span className="text-[15px] text-ink">
              {fileName || 'Choose the notes file for this topic'}
            </span>
            <span className="eyebrow">Accepts .pdf, .txt or .md</span>
            <input
              type="file"
              name="file"
              accept=".pdf,.txt,.md"
              required
              onChange={(e) => setFileName(e.target.files?.[0]?.name ?? '')}
              className="sr-only"
            />
          </label>
          <div className="flex gap-4">
            <label className="flex-1">
              <span className="eyebrow mb-2 block">Target Elo 0–100</span>
              <input
                type="number"
                name="target_elo"
                min={0}
                max={100}
                defaultValue={50}
                required
                className="well w-full px-3 py-2.5 font-util text-sm tabular-nums text-ink outline-none"
              />
            </label>
            <label className="flex-1">
              <span className="eyebrow mb-2 block">How many 1–20</span>
              <input
                type="number"
                name="count"
                min={1}
                max={20}
                defaultValue={5}
                required
                className="well w-full px-3 py-2.5 font-util text-sm tabular-nums text-ink outline-none"
              />
            </label>
          </div>
          <button type="submit" disabled={generating} className="btn btn-solid w-full py-3.5">
            {generating ? 'Reading the notes…' : 'Generate candidates'}
          </button>
          {generating && (
            <div className="space-y-3" aria-hidden>
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
          )}
        </form>
      )}

      {/* Empty state — session created but the model returned nothing usable. */}
      {session && candidates.length === 0 && (
        <div className="mt-8">
          <Quiet>Nothing usable came back. Try a different file, or a smaller count.</Quiet>
        </div>
      )}

      {/* Review cards. */}
      {visibleCandidates.length > 0 && (
        <div className="mt-12">
          <SectionHead
            label="Candidates"
            aside={
              <span className="shrink-0 font-util text-[11px] uppercase tracking-[0.1em] tabular-nums text-muted">
                {published} published
              </span>
            }
          />
        </div>
      )}

      <div className="mt-6 space-y-6">
        <AnimatePresence initial={false}>
          {visibleCandidates.map((r, i) => (
            <motion.div
              key={r.id}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.15 }}
            >
              <CandidateCard
                reviewed={r}
                number={i + 1}
                status={status[r.id] ?? 'pending'}
                onAccept={onAccept}
                onReject={onReject}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Spec 15 — iterative controls, only while the session is active. */}
      {session && !finished && (
        <>
          {/* Generate More — another batch, steered by accepted questions. */}
          <div className="mt-16">
            <SectionHead label="Generate more" />
            <p className="mt-4 text-[15px] leading-relaxed text-muted">
              Another batch from the same notes, steered by what you have accepted so far.
            </p>
            <div className="mt-5 flex flex-wrap items-end gap-4">
              <label className="min-w-32 flex-1">
                <span className="eyebrow mb-2 block">How many 1–20</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={moreCount}
                  onChange={(e) => setMoreCount(Number(e.target.value))}
                  className="well w-full px-3 py-2.5 font-util text-sm tabular-nums text-ink outline-none"
                />
              </label>
              <label className="min-w-32 flex-1">
                <span className="eyebrow mb-2 block">Target Elo</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={moreElo}
                  placeholder={String(session.target_elo)}
                  onChange={(e) => setMoreElo(e.target.value)}
                  className="well w-full px-3 py-2.5 font-util text-sm tabular-nums text-ink outline-none"
                />
              </label>
              <button
                onClick={onGenerateMore}
                disabled={generatingMore}
                className="btn btn-solid flex items-center gap-2 px-5 py-2.5"
              >
                <Sparkles aria-hidden size={14} strokeWidth={1.75} />
                {generatingMore ? 'Generating…' : 'Generate more'}
              </button>
            </div>
          </div>

          {/* Chat — grounded in the uploaded notes; can also author questions. */}
          <div className="mt-16">
            <SectionHead label="Ask about these notes" />
            <p className="mt-4 text-[15px] leading-relaxed text-muted">
              Ask what the notes cover, or ask for questions — “three harder ones on
              stoichiometry”.
            </p>
            {messages.length > 0 && (
              <div className="mt-6 space-y-6">
                {messages.map((m, i) => {
                  const items = m.items ? visible(m.items) : []
                  return (
                    <div key={i}>
                      <div
                        className={`border-l-2 pl-4 ${
                          m.role === 'user' ? 'border-signal' : 'border-rule'
                        }`}
                      >
                        <p className="eyebrow">{m.role === 'user' ? 'You' : 'AdaptIQ'}</p>
                        <p className="mt-1.5 text-[15px] leading-relaxed text-ink">{m.content}</p>
                      </div>

                      {/* Questions this turn wrote, under the turn that wrote them. */}
                      {items.length > 0 && (
                        <div className="mt-5 space-y-6 border-l-2 border-rule pl-4">
                          <p className="eyebrow">
                            {items.length} question{items.length > 1 ? 's' : ''} from this reply
                          </p>
                          {items.map((r, n) => (
                            <CandidateCard
                              key={r.id}
                              reviewed={r}
                              number={n + 1}
                              status={status[r.id] ?? 'pending'}
                              onAccept={onAccept}
                              onReject={onReject}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
                {chatting && (
                  <div className="border-l-2 border-rule pl-4">
                    <p className="eyebrow">AdaptIQ</p>
                    <Skeleton className="mt-2 h-4 w-48" />
                  </div>
                )}
              </div>
            )}
            <form onSubmit={onSendChat} className="mt-6 flex gap-3">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask about the notes…"
                aria-label="Ask about the notes"
                className="well flex-1 px-3.5 py-2.5 text-[15px] text-ink outline-none"
              />
              <button
                type="submit"
                disabled={chatting || !chatInput.trim()}
                className="btn btn-solid px-5 py-2.5"
              >
                {chatting ? 'Sending…' : 'Send'}
              </button>
            </form>
          </div>

          <button onClick={onFinish} className="btn btn-quiet mt-16 w-full py-3.5">
            Finish session
          </button>
        </>
      )}
      {finished && (
        <p className="mt-8 flex items-center gap-2 rounded-full border border-easy/30 bg-easy/10 px-4 py-2.5 font-util text-xs uppercase tracking-[0.1em] text-easy">
          <CheckCircle2 aria-hidden size={14} strokeWidth={1.75} />
          Saved. Taking you back to the topic list…
        </p>
      )}
    </Shell>
  )
}

// One reviewable question. Identical whether it came from the notes batch or
// from a chat reply, so the review action means the same thing in both places.
function CandidateCard({
  reviewed,
  number,
  status,
  onAccept,
  onReject,
}: {
  reviewed: Reviewed
  number: number
  status: CardStatus
  onAccept: (r: Reviewed) => void
  onReject: (r: Reviewed) => void
}) {
  const c = reviewed.candidate
  return (
    <article className="pane px-5 py-5 sm:px-6">
      <div className="flex items-baseline justify-between gap-4">
        <span className="font-util text-xs font-semibold tabular-nums text-muted">
          {String(number).padStart(2, '0')}
        </span>
        <span className="rounded-full border border-rule px-2.5 py-1 font-util text-[10px] uppercase tracking-[0.1em] tabular-nums text-muted">
          Elo {c.elo_question}
        </span>
      </div>
      <p className="mt-2 font-read text-[17px] leading-relaxed text-ink">{c.question_text}</p>

      <ul className="mt-4 space-y-1.5">
        {LETTERS.map((letter) => {
          const isCorrect = c.correct_answer === letter
          return (
            <li
              key={letter}
              className={`flex items-baseline gap-3 rounded-md border-l-2 px-3 py-2 text-[15px] ${
                isCorrect ? 'border-easy bg-easy/10 text-ink' : 'border-rule text-muted'
              }`}
            >
              <span className="font-util text-xs font-semibold">{letter}</span>
              <span className="grow">
                {c[`option_${letter.toLowerCase()}` as keyof Candidate] as string}
              </span>
              {isCorrect && <span className="eyebrow shrink-0 text-easy">Correct</span>}
            </li>
          )
        })}
      </ul>

      <div className="mt-5 border-l-2 border-signal pl-4">
        <p className="eyebrow">Why</p>
        <p className="mt-1.5 font-read text-[15px] leading-relaxed text-muted">{c.explanation}</p>
      </div>

      <div className="mt-5 flex items-center gap-3">
        {status === 'published' && (
          <span className="flex items-center gap-1.5 rounded-full border border-easy/30 bg-easy/10 px-3 py-1.5 font-util text-[10px] uppercase tracking-[0.14em] text-easy">
            <CheckCircle2 aria-hidden size={12} strokeWidth={1.75} /> Published
          </span>
        )}
        {status === 'duplicate' && (
          <span className="rounded-full border border-medium/30 bg-medium/10 px-3 py-1.5 font-util text-[10px] uppercase tracking-[0.14em] text-medium">
            Already in the bank
          </span>
        )}
        {(status === 'pending' || status === 'accepting') && (
          <>
            <button
              onClick={() => onAccept(reviewed)}
              disabled={status === 'accepting'}
              className="btn btn-solid flex items-center gap-1.5 px-4 py-2"
            >
              <Check aria-hidden size={13} strokeWidth={2} />
              {status === 'accepting' ? 'Publishing…' : 'Accept'}
            </button>
            <button
              onClick={() => onReject(reviewed)}
              disabled={status === 'accepting'}
              className="btn btn-quiet flex items-center gap-1.5 px-4 py-2"
            >
              <X aria-hidden size={13} strokeWidth={2} />
              Reject
            </button>
          </>
        )}
      </div>
    </article>
  )
}
