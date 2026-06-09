export type NoteName = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B'

export type AccidentalNoteName = 'C#' | 'D#' | 'F#' | 'G#' | 'A#'

export type AnswerName = NoteName | AccidentalNoteName

export type Clef = 'treble' | 'bass'

export type NoteLabelMode = 'letter' | 'fixedDo'

export type AnswerMode = 'text' | 'piano'

export type AnimationLevel = 'standard' | 'simple'

export type ViewName = 'home' | 'practice' | 'levels' | 'rewards' | 'history' | 'settings' | 'privacy'

export type PracticeMode = 'daily' | 'review' | 'level'

export interface NoteItem {
  id: string
  clef: Clef
  name: NoteName
  octave: number
  labelFixedDo: string
  staffStep: number
  ledgerLines?: number[]
}

export interface LevelConfig {
  id: string
  title: string
  subtitle: string
  noteIds: string[]
  accent: string
}

export interface UserSettings {
  dailyQuestionCount: 5 | 10 | 15 | 20
  noteLabelMode: NoteLabelMode
  answerMode: AnswerMode
  soundEnabled: boolean
  animationLevel: AnimationLevel
  currentLevelId: string
}

export interface AnswerRecord {
  questionId: string
  noteId: string
  selectedAnswer: AnswerName
  correctAnswer: NoteName
  isCorrect: boolean
  responseTimeMs: number
  answeredAt: number
}

export interface NoteProgress {
  noteId: string
  totalAttempts: number
  correctAttempts: number
  wrongAttempts: number
  currentStreak: number
  wrongStreak: number
  avgResponseTimeMs: number
  lastPracticedAt?: number
  mastered: boolean
  recentResults: boolean[]
  recentResponseTimesMs: number[]
}

export interface PracticeSession {
  id: string
  startedAt: number
  endedAt: number
  levelId: string
  questionCount: number
  correctCount: number
  avgResponseTimeMs: number
  earnedStars: number
  records: AnswerRecord[]
}

export interface Badge {
  id: string
  name: string
  description: string
  unlockedAt: number
}

export interface Sticker {
  id: string
  name: string
  description: string
  unlockedAt: number
}

export interface RewardState {
  totalStars: number
  streakDays: number
  lastPracticeDate?: string
  badges: Badge[]
  stickers: Sticker[]
}

export interface AppState {
  settings: UserSettings
  noteProgress: Record<string, NoteProgress>
  sessions: PracticeSession[]
  rewards: RewardState
}

export interface PracticeSummary {
  session: PracticeSession
  newBadges: Badge[]
  newStickers: Sticker[]
  weakNoteIds: string[]
}
