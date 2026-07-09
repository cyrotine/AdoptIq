// Types for the quiz generate/submit API (spec 03).

export interface Subject {
  subject_id: number
  subject_name: string
}

export type Answer = 'A' | 'B' | 'C' | 'D'

export interface QuizQuestion {
  question_id: string
  question_text: string
  option_a: string
  option_b: string
  option_c: string
  option_d: string
  difficulty_label: 'Easy' | 'Medium' | 'Hard'
  estimated_time: number | null
}

export interface Composition {
  easy: number
  medium: number
  hard: number
}

export interface GenerateResponse {
  subject: string
  composition: Composition
  questions: QuizQuestion[]
}

// Router state passed from Home to /quiz (subject_id is needed again at submit).
export interface QuizState {
  quiz: GenerateResponse
  subjectId: number
}

export interface QuestionResult {
  question_id: string
  question_text: string
  option_a: string
  option_b: string
  option_c: string
  option_d: string
  student_answer: Answer | null
  correct_answer: Answer
  is_correct: boolean
  explanation: string | null
}

export interface SubmitResponse {
  quiz_id: string
  score: number
  total: number
  composition: Composition
  total_time_taken: number
  results: QuestionResult[]
}

export interface HistoryItem {
  quiz_id: string
  subject: string
  completed_on: string
  easy_questions: number
  medium_questions: number
  hard_questions: number
  total_questions: number
  correct_answers: number
  accuracy: number
  total_time_taken: number
}
