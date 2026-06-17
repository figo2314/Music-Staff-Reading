import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Award,
  BarChart3,
  BookOpen,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  History,
  Home,
  Music2,
  RotateCcw,
  Settings,
  Sparkles,
  Star,
  Timer,
  Trophy,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import './App.css'
import { PianoKeyboard } from './components/PianoKeyboard'
import { RhythmStaff } from './components/RhythmStaff'
import { StaffCanvas } from './components/StaffCanvas'
import { getLevel, getNoteDisplay, getNoteLabel, LEVELS, NOTES_BY_ID } from './data/notes'
import { RHYTHM_ANSWER_OPTIONS, RHYTHM_PATTERNS, RHYTHM_PATTERNS_BY_ID } from './data/rhythms'
import { playFeedbackTone, playPianoNote } from './lib/audio'
import { launchCompletionConfetti } from './lib/celebration'
import { formatShortDate, getLocalDateKey } from './lib/date'
import {
  buildAnswerOptions,
  finishPracticeSession,
  getAvailableNotes,
  getWeakNoteIds,
  isWeakNote,
} from './lib/practice'
import { loadAppState, resetAppState, saveAppState } from './lib/storage'
import type {
  AnswerRecord,
  AnswerName,
  AppState,
  NoteItem,
  PracticeMode,
  PracticeSummary,
  RhythmPattern,
  SessionType,
  UserSettings,
  ViewName,
} from './types'

interface NoteQuestionState {
  kind: 'note'
  id: string
  note: NoteItem
  startedAt: number
  answerOptions: AnswerName[]
}

interface RhythmQuestionState {
  kind: 'rhythm'
  id: string
  rhythm: RhythmPattern
  startedAt: number
  answerOptions: string[]
}

interface RhythmTapQuestionState {
  kind: 'rhythmTap'
  id: string
  rhythm: RhythmPattern
  startedAt: number
  tapBeats: number[]
}

type QuestionState = NoteQuestionState | RhythmQuestionState | RhythmTapQuestionState

interface PracticeState {
  sessionType: SessionType
  mode: PracticeMode
  levelId: string
  total: number
  startedAt: number
  records: AnswerRecord[]
  question: QuestionState
  questionDeck: string[]
  currentIndex: number
  feedback: 'idle' | 'correct' | 'wrong'
  questionHadWrong: boolean
  selectedAnswer?: string
  selectedNoteId?: string
  tapPrepStartedAt?: number
  tapStartedAt?: number
  tapTimes?: number[]
  tapFeedbacks?: TapFeedback[]
  tapResult?: TapResult
  summary?: PracticeSummary
}

interface TapFeedback {
  offsetMs: number
  label: string
  tone: 'good' | 'early' | 'late' | 'miss'
}

interface TapResult {
  score: number
  avgOffsetMs: number
  maxOffsetMs: number
  label: string
  offsets: number[]
}

const TAP_BEAT_MS = 667
const TAP_PREP_BEATS = 4

const navItems: Array<{ view: ViewName; label: string; icon: typeof Home }> = [
  { view: 'home', label: '练习', icon: Home },
  { view: 'levels', label: '关卡', icon: BookOpen },
  { view: 'rewards', label: '奖励', icon: Trophy },
  { view: 'history', label: '记录', icon: History },
  { view: 'settings', label: '设置', icon: Settings },
]

function App() {
  const [state, setState] = useState<AppState>(() => loadAppState())
  const [view, setView] = useState<ViewName>('home')
  const [practice, setPractice] = useState<PracticeState | null>(null)
  const [clockTick, setClockTick] = useState(0)
  const advanceTimerRef = useRef<number | null>(null)

  useEffect(() => {
    saveAppState(state)
  }, [state])

  useEffect(
    () => () => {
      if (advanceTimerRef.current !== null) {
        window.clearTimeout(advanceTimerRef.current)
      }
    },
    [],
  )

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || !practice || practice.question.kind !== 'rhythmTap' || practice.feedback !== 'idle') {
        return
      }

      event.preventDefault()
      if (!practice.tapStartedAt) {
        setPractice((current) => {
          if (!current || current.question.kind !== 'rhythmTap' || current.feedback !== 'idle') {
            return current
          }
          const prepStartedAt = Date.now()
          return {
            ...current,
            tapPrepStartedAt: prepStartedAt,
            tapStartedAt: prepStartedAt + TAP_PREP_BEATS * TAP_BEAT_MS,
            tapTimes: [],
            tapFeedbacks: [],
            tapResult: undefined,
          }
        })
        return
      }
      if ((practice.tapTimes?.length ?? 0) < practice.question.tapBeats.length) {
        setPractice((current) => {
          if (!current || current.question.kind !== 'rhythmTap' || current.feedback !== 'idle' || !current.tapStartedAt) {
            return current
          }
          const tapTimes = [...(current.tapTimes ?? []), Date.now()]
          const offsetMs = getTapOffset(current.question.tapBeats, current.tapStartedAt, tapTimes)
          const tapFeedbacks = [...(current.tapFeedbacks ?? []), getTapFeedback(offsetMs)]
          if (state.settings.soundEnabled) {
            playFeedbackTone('correct')
          }
          return {
            ...current,
            tapTimes: tapTimes.slice(0, current.question.tapBeats.length),
            tapFeedbacks: tapFeedbacks.slice(0, current.question.tapBeats.length),
          }
        })
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [practice, state.settings.soundEnabled])

  useEffect(() => {
    if (!practice?.tapPrepStartedAt || !practice.tapStartedAt || Date.now() >= practice.tapStartedAt) {
      return
    }

    const timer = window.setInterval(() => setClockTick((tick) => tick + 1), 120)
    return () => window.clearInterval(timer)
  }, [practice?.tapPrepStartedAt, practice?.tapStartedAt])

  void clockTick

  const todaySessions = useMemo(() => {
    const today = getLocalDateKey()
    return state.sessions.filter(
      (session) => (session.sessionType ?? 'note') === 'note' && getLocalDateKey(new Date(session.startedAt)) === today,
    )
  }, [state.sessions])
  const todayAnswered = todaySessions.reduce((sum, session) => sum + session.questionCount, 0)
  const todayCorrect = todaySessions.reduce((sum, session) => sum + session.correctCount, 0)
  const currentLevel = getLevel(state.settings.currentLevelId)
  const weakNoteIds = getWeakNoteIds(state.noteProgress)
  const masteredCount = Object.values(state.noteProgress).filter((item) => item.mastered).length

  const clearAdvanceTimer = () => {
    if (advanceTimerRef.current !== null) {
      window.clearTimeout(advanceTimerRef.current)
      advanceTimerRef.current = null
    }
  }

  const startPractice = (mode: PracticeMode, levelId = state.settings.currentLevelId) => {
    clearAdvanceTimer()
    const includeAccidentals = state.settings.difficultyMode === 'chromatic'
    const notes = getAvailableNotes(levelId, mode === 'review', state.noteProgress, includeAccidentals)
    const noteDeck = buildNoteDeck(notes, state.noteProgress, state.settings.dailyQuestionCount)
    const questionNote = NOTES_BY_ID[noteDeck[0]]
    setPractice({
      sessionType: 'note',
      mode,
      levelId,
      total: noteDeck.length,
      startedAt: Date.now(),
      records: [],
      questionDeck: noteDeck,
      currentIndex: 0,
      question: {
        kind: 'note',
        id: `q-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        note: questionNote,
        startedAt: Date.now(),
        answerOptions: buildAnswerOptions(includeAccidentals),
      },
      feedback: 'idle',
      questionHadWrong: false,
    })
    setView('practice')
  }

  const startRhythmPractice = () => {
    clearAdvanceTimer()
    const rhythmDeck = buildRhythmDeck(state.settings.dailyQuestionCount)
    const rhythm = RHYTHM_PATTERNS_BY_ID[rhythmDeck[0]]
    setPractice({
      sessionType: 'rhythm',
      mode: 'daily',
      levelId: 'rhythm-basic',
      total: rhythmDeck.length,
      startedAt: Date.now(),
      records: [],
      questionDeck: rhythmDeck,
      currentIndex: 0,
      question: {
        kind: 'rhythm',
        id: `r-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        rhythm,
        startedAt: Date.now(),
        answerOptions: buildRhythmAnswerOptions(rhythm.id),
      },
      feedback: 'idle',
      questionHadWrong: false,
    })
    setView('practice')
  }

  const startRhythmTapPractice = () => {
    clearAdvanceTimer()
    const rhythmDeck = buildRhythmDeck(state.settings.dailyQuestionCount)
    const rhythm = RHYTHM_PATTERNS_BY_ID[rhythmDeck[0]]
    setPractice({
      sessionType: 'rhythmTap',
      mode: 'daily',
      levelId: 'rhythm-tap-basic',
      total: rhythmDeck.length,
      startedAt: Date.now(),
      records: [],
      questionDeck: rhythmDeck,
      currentIndex: 0,
      question: {
        kind: 'rhythmTap',
        id: `t-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        rhythm,
        startedAt: Date.now(),
        tapBeats: getTapBeats(rhythm),
      },
      feedback: 'idle',
      questionHadWrong: false,
      tapTimes: [],
      tapFeedbacks: [],
    })
    setView('practice')
  }

  const answerQuestion = (answer: string, selectedNoteId?: string) => {
    if (!practice || practice.feedback !== 'idle') {
      return
    }

    let isCorrect: boolean
    if (practice.question.kind === 'note') {
      isCorrect = selectedNoteId
        ? selectedNoteId === getPlayableNoteId(practice.question.note)
        : answer === practice.question.note.name
    } else {
      isCorrect = answer === practice.question.rhythm.id
    }

    if (state.settings.soundEnabled) {
      if (selectedNoteId) {
        playPianoNote(selectedNoteId)
      }
      if (!isCorrect) {
        playFeedbackTone('wrong')
      } else if (!selectedNoteId) {
        playFeedbackTone('correct')
      }
    }

    if (!isCorrect) {
      setPractice({
        ...practice,
        feedback: 'wrong',
        questionHadWrong: true,
        selectedAnswer: answer,
        selectedNoteId,
      })

      const practiceStartedAt = practice.startedAt
      advanceTimerRef.current = window.setTimeout(() => {
        advanceTimerRef.current = null
        setPractice((current) =>
          current && current.startedAt === practiceStartedAt
            ? {
                ...current,
                feedback: 'idle',
                selectedAnswer: undefined,
                selectedNoteId: undefined,
              }
            : current,
        )
      }, state.settings.animationLevel === 'simple' ? 700 : 1150)
      return
    }

    const record: AnswerRecord =
      practice.question.kind === 'note'
        ? {
            questionId: practice.question.id,
            noteId: practice.question.note.id,
            selectedAnswer: answer,
            selectedNoteId,
            correctAnswer: practice.question.note.name,
            correctNoteId: getPlayableNoteId(practice.question.note),
            isCorrect: !practice.questionHadWrong,
            responseTimeMs: Date.now() - practice.question.startedAt,
            answeredAt: Date.now(),
          }
        : {
            questionId: practice.question.id,
            noteId: practice.question.rhythm.id,
            selectedAnswer: answer,
            correctAnswer: practice.question.rhythm.id,
            correctNoteId: practice.question.rhythm.id,
            isCorrect: !practice.questionHadWrong,
            responseTimeMs: Date.now() - practice.question.startedAt,
            answeredAt: Date.now(),
          }
    const records = [...practice.records, record]

    setPractice({
      ...practice,
      records,
      feedback: 'correct',
      selectedAnswer: answer,
      selectedNoteId,
    })

    const practiceStartedAt = practice.startedAt
    advanceTimerRef.current = window.setTimeout(() => {
      advanceTimerRef.current = null
      setPractice((current) => {
        if (!current || current.startedAt !== practiceStartedAt) {
          return current
        }

        if (records.length >= current.total) {
          const result = finishPracticeSession(state, records, current.levelId, current.startedAt, current.sessionType)
          setState(result.state)
          if (state.settings.soundEnabled) {
            playFeedbackTone('complete')
          }
          launchCompletionConfetti(state.settings.animationLevel === 'simple')
          return {
            ...current,
            records,
            feedback: 'correct',
            summary: result.summary,
          }
        }

        if (current.sessionType === 'rhythm') {
          const nextIndex = current.currentIndex + 1
          const nextRhythm = RHYTHM_PATTERNS_BY_ID[current.questionDeck[nextIndex]]
          return {
            ...current,
            records,
            currentIndex: nextIndex,
            selectedAnswer: undefined,
            selectedNoteId: undefined,
            feedback: 'idle',
            questionHadWrong: false,
            question: {
              kind: 'rhythm',
              id: `r-${Date.now()}-${Math.random().toString(16).slice(2)}`,
              rhythm: nextRhythm,
              startedAt: Date.now(),
              answerOptions: buildRhythmAnswerOptions(nextRhythm.id),
            },
          }
        }

        const includeAccidentals = state.settings.difficultyMode === 'chromatic'
        const nextIndex = current.currentIndex + 1
        const nextNote = NOTES_BY_ID[current.questionDeck[nextIndex]]
        return {
          ...current,
          records,
          currentIndex: nextIndex,
          selectedAnswer: undefined,
          selectedNoteId: undefined,
          feedback: 'idle',
          questionHadWrong: false,
          question: {
            id: `q-${Date.now()}-${Math.random().toString(16).slice(2)}`,
            kind: 'note',
            note: nextNote,
            startedAt: Date.now(),
            answerOptions: buildAnswerOptions(includeAccidentals),
          },
        }
      })
    }, state.settings.animationLevel === 'simple' ? 450 : 760)
  }

  const startTapQuestion = () => {
    setPractice((current) => {
      if (!current || current.question.kind !== 'rhythmTap' || current.feedback !== 'idle') {
        return current
      }

      const prepStartedAt = Date.now()
      return {
        ...current,
        tapPrepStartedAt: prepStartedAt,
        tapStartedAt: prepStartedAt + TAP_PREP_BEATS * TAP_BEAT_MS,
        tapTimes: [],
        tapFeedbacks: [],
        tapResult: undefined,
      }
    })
  }

  const tapRhythmBeat = () => {
    setPractice((current) => {
      if (!current || current.question.kind !== 'rhythmTap' || current.feedback !== 'idle' || !current.tapStartedAt) {
        return current
      }

      const tapTimes = [...(current.tapTimes ?? []), Date.now()]
      const offsetMs = getTapOffset(current.question.tapBeats, current.tapStartedAt, tapTimes)
      const tapFeedbacks = [...(current.tapFeedbacks ?? []), getTapFeedback(offsetMs)]
      if (state.settings.soundEnabled) {
        playFeedbackTone('correct')
      }

      return {
        ...current,
        tapTimes: tapTimes.slice(0, current.question.tapBeats.length),
        tapFeedbacks: tapFeedbacks.slice(0, current.question.tapBeats.length),
      }
    })
  }

  const submitTapQuestion = () => {
    if (!practice || practice.question.kind !== 'rhythmTap' || practice.feedback !== 'idle' || !practice.tapStartedAt) {
      return
    }

    const tapTimes = practice.tapTimes ?? []
    const tapResult = scoreTapRhythm(practice.question.tapBeats, practice.tapStartedAt, tapTimes)
    const isCorrect = tapResult.score >= 70
    if (state.settings.soundEnabled) {
      playFeedbackTone(isCorrect ? 'correct' : 'wrong')
    }

    const record: AnswerRecord = {
      questionId: practice.question.id,
      noteId: practice.question.rhythm.id,
      selectedAnswer: `${tapResult.score}`,
      correctAnswer: practice.question.rhythm.id,
      correctNoteId: practice.question.rhythm.id,
      isCorrect,
      responseTimeMs: Date.now() - practice.question.startedAt,
      answeredAt: Date.now(),
    }
    const records = [...practice.records, record]

    setPractice({
      ...practice,
      records,
      feedback: isCorrect ? 'correct' : 'wrong',
      questionHadWrong: !isCorrect,
      tapResult,
    })

    const practiceStartedAt = practice.startedAt
    advanceTimerRef.current = window.setTimeout(() => {
      advanceTimerRef.current = null
      setPractice((current) => {
        if (!current || current.startedAt !== practiceStartedAt) {
          return current
        }

        if (records.length >= current.total) {
          const result = finishPracticeSession(state, records, current.levelId, current.startedAt, current.sessionType)
          setState(result.state)
          if (state.settings.soundEnabled) {
            playFeedbackTone('complete')
          }
          launchCompletionConfetti(state.settings.animationLevel === 'simple')
          return {
            ...current,
            records,
            feedback: isCorrect ? 'correct' : 'wrong',
            summary: result.summary,
          }
        }

        const nextIndex = current.currentIndex + 1
        const nextRhythm = RHYTHM_PATTERNS_BY_ID[current.questionDeck[nextIndex]]
        return {
          ...current,
          records,
          currentIndex: nextIndex,
          feedback: 'idle',
          questionHadWrong: false,
          selectedAnswer: undefined,
          selectedNoteId: undefined,
          tapStartedAt: undefined,
          tapPrepStartedAt: undefined,
          tapTimes: [],
          tapFeedbacks: [],
          tapResult: undefined,
          question: {
            kind: 'rhythmTap',
            id: `t-${Date.now()}-${Math.random().toString(16).slice(2)}`,
            rhythm: nextRhythm,
            startedAt: Date.now(),
            tapBeats: getTapBeats(nextRhythm),
          },
        }
      })
    }, state.settings.animationLevel === 'simple' ? 850 : 1250)
  }

  const leavePractice = (nextView: ViewName) => {
    clearAdvanceTimer()
    setPractice(null)
    setView(nextView)
  }

  const updateSettings = (settings: Partial<UserSettings>) => {
    setState((current) => ({
      ...current,
      settings: {
        ...current.settings,
        ...settings,
      },
    }))
  }

  const clearData = () => {
    const nextState = resetAppState()
    setState(nextState)
    setPractice(null)
    setView('home')
  }

  return (
    <div className={view === 'practice' ? 'app-shell practice-active' : 'app-shell'}>
      <main className="main-surface">
        {view === 'home' && (
          <HomeView
            currentLevelTitle={
              state.settings.difficultyMode === 'chromatic' ? '全部琴键（包含黑键）' : currentLevel.title
            }
            todayAnswered={todayAnswered}
            todayCorrect={todayCorrect}
            totalTarget={state.settings.dailyQuestionCount}
            streakDays={state.rewards.streakDays}
            totalStars={state.rewards.totalStars}
            weakCount={weakNoteIds.length}
            masteredCount={masteredCount}
            onStart={() => startPractice('daily')}
            onStartRhythm={startRhythmPractice}
            onStartRhythmTap={startRhythmTapPractice}
            onReview={() => startPractice('review')}
            onOpenHistory={() => setView('history')}
          />
        )}

        {view === 'practice' && practice && (
          <PracticeView
            practice={practice}
            labelMode={state.settings.noteLabelMode}
            answerMode={state.settings.answerMode}
            onAnswer={answerQuestion}
            onTapStart={startTapQuestion}
            onTapBeat={tapRhythmBeat}
            onTapSubmit={submitTapQuestion}
            onRestart={() =>
              practice.sessionType === 'rhythmTap'
                ? startRhythmTapPractice()
                : practice.sessionType === 'rhythm'
                  ? startRhythmPractice()
                  : startPractice(practice.mode, practice.levelId)
            }
            onHome={() => leavePractice('home')}
            onHistory={() => leavePractice('history')}
          />
        )}

        {view === 'levels' && (
          <LevelsView
            currentLevelId={state.settings.currentLevelId}
            progress={state.noteProgress}
            onSelect={(levelId) => {
              updateSettings({ currentLevelId: levelId })
              startPractice('level', levelId)
            }}
          />
        )}

        {view === 'rewards' && <RewardsView state={state} />}

        {view === 'history' && <HistoryView state={state} />}

        {view === 'settings' && (
          <SettingsView
            settings={state.settings}
            onUpdate={updateSettings}
            onClear={clearData}
            onOpenPrivacy={() => setView('privacy')}
          />
        )}

        {view === 'privacy' && <PrivacyView onBack={() => setView('settings')} />}
      </main>

      {view !== 'practice' && (
        <nav className="bottom-nav" aria-label="主导航">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = view === item.view
            return (
              <button
                key={item.view}
                className={isActive ? 'nav-item active' : 'nav-item'}
                type="button"
                onClick={() => leavePractice(item.view)}
              >
                <Icon aria-hidden="true" size={20} />
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>
      )}
    </div>
  )
}

function HomeView({
  currentLevelTitle,
  todayAnswered,
  todayCorrect,
  totalTarget,
  streakDays,
  totalStars,
  weakCount,
  masteredCount,
  onStart,
  onStartRhythm,
  onStartRhythmTap,
  onReview,
  onOpenHistory,
}: {
  currentLevelTitle: string
  todayAnswered: number
  todayCorrect: number
  totalTarget: number
  streakDays: number
  totalStars: number
  weakCount: number
  masteredCount: number
  onStart: () => void
  onStartRhythm: () => void
  onStartRhythmTap: () => void
  onReview: () => void
  onOpenHistory: () => void
}) {
  const progress = Math.min(100, Math.round((todayAnswered / totalTarget) * 100))
  const accuracy = todayAnswered ? Math.round((todayCorrect / todayAnswered) * 100) : 0

  return (
    <section className="screen home-screen">
      <div className="topbar">
        <div>
          <p className="eyebrow">五线谱认谱</p>
          <h1>音符卡片</h1>
        </div>
        <div className="star-pill">
          <Star fill="currentColor" size={18} />
          {totalStars}
        </div>
      </div>

      <section className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">当前关卡</p>
          <h2>{currentLevelTitle}</h2>
          <p className="muted">每天练一小组，把音符位置变成直觉。</p>
        </div>
        <div className="hero-meter" aria-label={`今日进度 ${progress}%`}>
          <span>{progress}%</span>
          <svg viewBox="0 0 120 120" aria-hidden="true">
            <circle cx="60" cy="60" r="48" />
            <circle cx="60" cy="60" r="48" style={{ strokeDashoffset: 302 - (302 * progress) / 100 }} />
          </svg>
        </div>
      </section>

      <section className="practice-mode-panel" aria-label="练习模式">
        <button className="primary-button" type="button" onClick={onStart}>
          <Music2 aria-hidden="true" size={22} />
          开始今日练习
          <ChevronRight aria-hidden="true" size={20} />
        </button>
        <div className="mode-row-grid">
          <button className="mode-row" type="button" onClick={onReview} disabled={weakCount === 0}>
            <RotateCcw aria-hidden="true" size={19} />
            <span>
              <strong>薄弱音复习</strong>
              <small>{weakCount > 0 ? `${weakCount} 个音需要多练` : '暂无薄弱音'}</small>
            </span>
          </button>
          <button className="mode-row" type="button" onClick={onStartRhythm}>
            <BarChart3 aria-hidden="true" size={19} />
            <span>
              <strong>节奏识别</strong>
              <small>看一小节，选节奏型</small>
            </span>
          </button>
          <button className="mode-row" type="button" onClick={onStartRhythmTap}>
            <Timer aria-hidden="true" size={19} />
            <span>
              <strong>节奏跟拍</strong>
              <small>跟着谱面点拍</small>
            </span>
          </button>
        </div>
      </section>

      <div className="metric-grid">
        <MetricCard icon={CalendarDays} label="今日题数" value={`${todayAnswered}/${totalTarget}`} />
        <MetricCard icon={Check} label="今日正确率" value={todayAnswered ? `${accuracy}%` : '未开始'} />
        <MetricCard icon={Sparkles} label="连续练习" value={`${streakDays} 天`} />
        <MetricCard icon={Award} label="已掌握" value={`${masteredCount} 个音`} />
      </div>

      <button className="wide-row" type="button" onClick={onOpenHistory}>
        <div>
          <strong>薄弱音</strong>
          <span>{weakCount > 0 ? `现在有 ${weakCount} 个音需要多练` : '目前没有明显薄弱音'}</span>
        </div>
        <ChevronRight aria-hidden="true" size={20} />
      </button>
    </section>
  )
}

function PracticeView({
  practice,
  labelMode,
  answerMode,
  onAnswer,
  onTapStart,
  onTapBeat,
  onTapSubmit,
  onRestart,
  onHome,
  onHistory,
}: {
  practice: PracticeState
  labelMode: AppState['settings']['noteLabelMode']
  answerMode: AppState['settings']['answerMode']
  onAnswer: (answer: string, selectedNoteId?: string) => void
  onTapStart: () => void
  onTapBeat: () => void
  onTapSubmit: () => void
  onRestart: () => void
  onHome: () => void
  onHistory: () => void
}) {
  const rhythmQuestion = practice.question.kind === 'rhythm' ? practice.question : undefined
  const rhythmTapQuestion = practice.question.kind === 'rhythmTap' ? practice.question : undefined
  const noteQuestion = practice.question.kind === 'note' ? practice.question : undefined
  const isRhythmPractice = Boolean(rhythmQuestion || rhythmTapQuestion)
  const correctAnswer = rhythmQuestion?.rhythm.id ?? rhythmTapQuestion?.rhythm.id ?? noteQuestion?.note.name ?? ''
  const answeredCount = practice.records.length
  const progress = practice.summary ? 100 : Math.round((answeredCount / practice.total) * 100)
  const handlePianoClick = (noteId: string) => onAnswer(noteId.replace(/\d/g, '') as AnswerName, noteId)
  const combo = getTrailingCorrectStreak(practice.records)
  const tapTargetCount = rhythmTapQuestion?.tapBeats.length ?? 0
  const tapCount = practice.tapTimes?.length ?? 0
  const prepBeat = getPrepBeat(practice.tapPrepStartedAt, practice.tapStartedAt)

  if (practice.summary) {
    const session = practice.summary.session
    const accuracy = session.questionCount ? Math.round((session.correctCount / session.questionCount) * 100) : 0
    const bestStreak = getBestCorrectStreak(session.records)
    return (
      <section className="screen finish-screen">
        <div className="finish-burst" aria-hidden="true">
          <Star fill="currentColor" />
          <Sparkles />
          <Star fill="currentColor" />
        </div>
        <p className="celebration-title">太棒了！</p>
        <h1>{practice.sessionType === 'rhythmTap' ? '完成跟拍' : `完成${isRhythmPractice ? '节奏' : '练习'}`}</h1>
        <p className="muted">
          {practice.sessionType === 'rhythmTap'
            ? '手感和节拍正在对齐。'
            : isRhythmPractice
              ? '节拍感又稳了一点。'
              : '今天的小舞台已经点亮。'}
        </p>
        <div className="finish-score">
          <span>{accuracy}%</span>
          <small>正确率</small>
        </div>
        <div className="metric-grid">
          <MetricCard icon={Star} label="获得星星" value={`${session.earnedStars}`} />
          <MetricCard icon={Check} label="答对题数" value={`${session.correctCount}/${session.questionCount}`} />
          <MetricCard icon={Clock3} label="平均用时" value={`${(session.avgResponseTimeMs / 1000).toFixed(1)}s`} />
          <MetricCard icon={BarChart3} label="最高连对" value={`${bestStreak} 题`} />
        </div>
        {(practice.summary.newBadges.length > 0 || practice.summary.newStickers.length > 0) && (
          <div className="reward-strip">
            {[...practice.summary.newBadges, ...practice.summary.newStickers].map((item) => (
              <span key={item.id}>
                <Award size={16} />
                {item.name}
              </span>
            ))}
          </div>
        )}
        <div className="finish-actions">
          <button className="primary-button" type="button" onClick={onRestart}>
            <RotateCcw aria-hidden="true" size={20} />
            再练一次
          </button>
          <button className="secondary-button" type="button" onClick={onHistory}>
            <History aria-hidden="true" size={18} />
            看记录
          </button>
          <button className="text-button" type="button" onClick={onHome}>
            回首页
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="screen practice-screen">
      <div className="practice-top">
        <button className="icon-button" type="button" onClick={onHome} aria-label="退出练习">
          <X aria-hidden="true" size={20} />
        </button>
        <div className="progress-bar" aria-label={`练习进度 ${progress}%`}>
          <span style={{ width: `${progress}%` }} />
        </div>
        <strong>{Math.min(answeredCount + 1, practice.total)}/{practice.total}</strong>
      </div>

      <div className={`note-card ${practice.feedback}`}>
        {rhythmQuestion ? (
          <RhythmStaff pattern={rhythmQuestion.rhythm} feedback={practice.feedback} />
        ) : rhythmTapQuestion ? (
          <RhythmStaff pattern={rhythmTapQuestion.rhythm} feedback={practice.feedback} />
        ) : noteQuestion ? (
          <StaffCanvas note={noteQuestion.note} feedback={practice.feedback} />
        ) : null}
        {practice.feedback === 'correct' && combo >= 2 && (
          <div
            key={`${practice.question.id}-${combo}`}
            className={`combo-pop ${combo >= 5 ? 'combo-fire' : combo >= 3 ? 'combo-hot' : ''}`}
            aria-live="polite"
          >
            <span aria-hidden="true">🔥</span>
            连击 x{combo}!
          </div>
        )}
      </div>

      <div className="feedback-zone">
        {practice.feedback === 'idle' && (
          <span>
            {rhythmTapQuestion
              ? practice.tapStartedAt
                ? prepBeat
                  ? `预备拍 ${prepBeat}`
                  : `按谱面点拍：${tapCount}/${tapTargetCount}`
                : '先看节奏，准备好就开始跟拍'
              : isRhythmPractice
                ? '这一小节是哪种节奏？'
                : '这个音是什么？'}
          </span>
        )}
        {practice.feedback === 'correct' && (
          <span className="correct-text">
            <Check size={18} /> 答对了，
            {rhythmTapQuestion
              ? practice.tapResult?.label
              : isRhythmPractice
                ? RHYTHM_PATTERNS_BY_ID[correctAnswer]?.countText
                : noteQuestion
                  ? getNoteDisplay(noteQuestion.note, labelMode)
                : ''}
          </span>
        )}
        {practice.feedback === 'wrong' && (
          <span className="wrong-text">
            <Sparkles size={18} /> 呀，其实是{' '}
            {rhythmTapQuestion
              ? practice.tapResult?.label
              : isRhythmPractice
                ? RHYTHM_PATTERNS_BY_ID[correctAnswer]?.title
                : getNoteLabel(correctAnswer as AnswerName, labelMode)}
            ，再试一次！
          </span>
        )}
      </div>

      {rhythmTapQuestion ? (
        <RhythmTapControls
          disabled={practice.feedback !== 'idle'}
          hasStarted={Boolean(practice.tapStartedAt)}
          tapCount={tapCount}
          targetCount={tapTargetCount}
          prepBeat={prepBeat}
          feedbacks={practice.tapFeedbacks ?? []}
          result={practice.tapResult}
          onStart={onTapStart}
          onTap={onTapBeat}
          onSubmit={onTapSubmit}
        />
      ) : practice.question.kind === 'rhythm' ? (
        <div className="rhythm-answer-grid">
          {practice.question.answerOptions.map((patternId) => {
            const option = RHYTHM_PATTERNS_BY_ID[patternId]
            const isSelected = practice.selectedAnswer === patternId
            const isCorrect = practice.feedback !== 'idle' && patternId === correctAnswer
            const isWrongSelected = practice.feedback === 'wrong' && isSelected
            return (
              <button
                key={patternId}
                type="button"
                className={[
                  'rhythm-answer-button',
                  isCorrect ? 'correct' : '',
                  isWrongSelected ? 'wrong' : '',
                  isSelected ? 'selected' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => onAnswer(patternId)}
                disabled={practice.feedback !== 'idle'}
              >
                <strong>{option.title}</strong>
                <span>{option.countText}</span>
              </button>
            )
          })}
        </div>
      ) : noteQuestion && answerMode === 'text' ? (
        <div className="answer-grid">
          {noteQuestion.answerOptions.map((answer) => {
            const isSelected = practice.selectedAnswer === answer
            const isCorrect = practice.feedback !== 'idle' && answer === correctAnswer
            const isWrongSelected = practice.feedback === 'wrong' && isSelected
            return (
              <button
                key={answer}
                type="button"
                className={[
                  'answer-button',
                  isCorrect ? 'correct' : '',
                  isWrongSelected ? 'wrong' : '',
                  isSelected ? 'selected' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => onAnswer(answer)}
                disabled={practice.feedback !== 'idle'}
              >
                {getNoteLabel(answer, labelMode)}
              </button>
            )
          })}
        </div>
      ) : (
        noteQuestion && (
          <PianoKeyboard
            disabled={practice.feedback !== 'idle'}
            feedback={practice.feedback}
            labelMode={labelMode}
            selectedNoteId={practice.selectedNoteId}
            correctNoteId={getPlayableNoteId(noteQuestion.note)}
            onPianoClick={handlePianoClick}
          />
        )
      )}
    </section>
  )
}

function LevelsView({
  currentLevelId,
  progress,
  onSelect,
}: {
  currentLevelId: string
  progress: AppState['noteProgress']
  onSelect: (levelId: string) => void
}) {
  return (
    <section className="screen">
      <ScreenHeader eyebrow="练习范围" title="关卡" />
      <div className="level-list">
        {LEVELS.map((level) => {
          const mastered = level.noteIds.filter((noteId) => progress[noteId]?.mastered).length
          const attempts = level.noteIds.reduce((sum, noteId) => sum + (progress[noteId]?.totalAttempts ?? 0), 0)
          return (
            <button key={level.id} className="level-card" type="button" onClick={() => onSelect(level.id)}>
              <span className="level-dot" style={{ background: level.accent }} />
              <div>
                <strong>{level.title}</strong>
                <span>{level.subtitle}</span>
                <small>
                  掌握 {mastered}/{level.noteIds.length}，累计 {attempts} 次
                </small>
              </div>
              {level.id === currentLevelId ? <Check size={20} /> : <ChevronRight size={20} />}
            </button>
          )
        })}
      </div>
    </section>
  )
}

function RhythmTapControls({
  disabled,
  hasStarted,
  tapCount,
  targetCount,
  prepBeat,
  feedbacks,
  result,
  onStart,
  onTap,
  onSubmit,
}: {
  disabled: boolean
  hasStarted: boolean
  tapCount: number
  targetCount: number
  prepBeat?: number
  feedbacks: TapFeedback[]
  result?: TapResult
  onStart: () => void
  onTap: () => void
  onSubmit: () => void
}) {
  const canSubmit = hasStarted && tapCount >= targetCount && !disabled

  return (
    <div className="tap-panel">
      <div className="tap-meter">
        {Array.from({ length: targetCount }, (_, index) => (
          <span key={index} className={index < tapCount ? 'filled' : ''} />
        ))}
      </div>
      {!hasStarted ? (
        <button className="primary-button" type="button" onClick={onStart} disabled={disabled}>
          <Timer aria-hidden="true" size={20} />
          开始跟拍
        </button>
      ) : (
        <>
          {prepBeat ? (
            <div className="prep-count" aria-live="polite">
              {prepBeat}
            </div>
          ) : (
            <div className="tap-feedback-strip" aria-live="polite">
              {feedbacks.length > 0 ? (
                feedbacks.map((feedback, index) => (
                  <span key={`${feedback.offsetMs}-${index}`} className={`tap-feedback ${feedback.tone}`}>
                    {feedback.label}
                  </span>
                ))
              ) : (
                <span className="tap-feedback">空格键也可以点拍</span>
              )}
            </div>
          )}
          <button
            className="tap-button"
            type="button"
            onClick={onTap}
            disabled={disabled || Boolean(prepBeat) || tapCount >= targetCount}
            aria-label="点拍"
          >
            点
          </button>
          <button className="secondary-button" type="button" onClick={onSubmit} disabled={!canSubmit}>
            完成这一小节
          </button>
        </>
      )}
      {result && (
        <div className="tap-result">
          <strong>{result.score} 分</strong>
          <span>
            平均偏差 {result.avgOffsetMs}ms，最大偏差 {result.maxOffsetMs}ms
          </span>
        </div>
      )}
    </div>
  )
}

function RewardsView({ state }: { state: AppState }) {
  return (
    <section className="screen">
      <ScreenHeader eyebrow="星星和徽章" title="奖励" />
      <section className="reward-hero">
        <div>
          <span>总星星</span>
          <strong>{state.rewards.totalStars}</strong>
        </div>
        <Star fill="currentColor" size={72} />
      </section>
      <h2 className="section-title">徽章墙</h2>
      <div className="collection-grid">
        {state.rewards.badges.length > 0 ? (
          state.rewards.badges.map((badge) => (
            <div className="collection-item" key={badge.id}>
              <Award size={26} />
              <strong>{badge.name}</strong>
              <span>{badge.description}</span>
            </div>
          ))
        ) : (
          <EmptyState text="完成第一次练习后会获得徽章。" />
        )}
      </div>
      <h2 className="section-title">贴纸收藏</h2>
      <div className="collection-grid">
        {state.rewards.stickers.length > 0 ? (
          state.rewards.stickers.map((sticker) => (
            <div className="collection-item sticker" key={sticker.id}>
              <Sparkles size={26} />
              <strong>{sticker.name}</strong>
              <span>{sticker.description}</span>
            </div>
          ))
        ) : (
          <EmptyState text="全对或掌握更多音符后会解锁贴纸。" />
        )}
      </div>
    </section>
  )
}

function HistoryView({ state }: { state: AppState }) {
  const sessions = state.sessions.slice(0, 14)
  const weakNotes = Object.values(state.noteProgress).filter((item) => isWeakNote(item))

  return (
    <section className="screen">
      <ScreenHeader eyebrow="进步看得见" title="历史记录" />
      <div className="metric-grid">
        <MetricCard icon={CalendarDays} label="练习次数" value={`${state.sessions.length}`} />
        <MetricCard icon={Star} label="总星星" value={`${state.rewards.totalStars}`} />
        <MetricCard icon={Sparkles} label="连续练习" value={`${state.rewards.streakDays} 天`} />
        <MetricCard icon={Award} label="徽章" value={`${state.rewards.badges.length}`} />
      </div>

      <h2 className="section-title">最近练习</h2>
      <div className="session-list">
        {sessions.length > 0 ? (
          sessions.map((session) => {
            const accuracy = session.questionCount ? Math.round((session.correctCount / session.questionCount) * 100) : 0
            return (
              <div className="session-row" key={session.id}>
                <div>
                  <strong>{formatShortDate(session.startedAt)}</strong>
                  <span>{getSessionTitle(session.sessionType, session.levelId)}</span>
                </div>
                <div className="session-stat">
                  <span>{accuracy}%</span>
                  <small>{(session.avgResponseTimeMs / 1000).toFixed(1)}s</small>
                </div>
              </div>
            )
          })
        ) : (
          <EmptyState text="完成一轮练习后，这里会出现记录。" />
        )}
      </div>

      <h2 className="section-title">薄弱音</h2>
      <div className="note-chip-list">
        {weakNotes.length > 0 ? (
          weakNotes.map((item) => {
            const note = NOTES_BY_ID[item.noteId]
            return (
              <span className="note-chip" key={item.noteId}>
                {note ? `${note.clef === 'bass' ? '低音' : '高音'} ${note.name}${note.octave}` : item.noteId}
                <small>{item.wrongStreak > 0 ? `连错 ${item.wrongStreak}` : '需复习'}</small>
              </span>
            )
          })
        ) : (
          <EmptyState text="现在没有明显薄弱音。" />
        )}
      </div>
    </section>
  )
}

function SettingsView({
  settings,
  onUpdate,
  onClear,
  onOpenPrivacy,
}: {
  settings: UserSettings
  onUpdate: (settings: Partial<UserSettings>) => void
  onClear: () => void
  onOpenPrivacy: () => void
}) {
  return (
    <section className="screen">
      <ScreenHeader eyebrow="家长设置" title="设置" />
      <div className="setting-group">
        <label>每日题数</label>
        <div className="segmented">
          {[5, 10, 15, 20].map((count) => (
            <button
              key={count}
              type="button"
              className={settings.dailyQuestionCount === count ? 'active' : ''}
              onClick={() => onUpdate({ dailyQuestionCount: count as UserSettings['dailyQuestionCount'] })}
            >
              {count}
            </button>
          ))}
        </div>
      </div>

      <div className="setting-group">
        <label>答案显示</label>
        <div className="segmented">
          <button
            type="button"
            className={settings.noteLabelMode === 'letter' ? 'active' : ''}
            onClick={() => onUpdate({ noteLabelMode: 'letter' })}
          >
            C D E
          </button>
          <button
            type="button"
            className={settings.noteLabelMode === 'fixedDo' ? 'active' : ''}
            onClick={() => onUpdate({ noteLabelMode: 'fixedDo' })}
          >
            Do Re Mi
          </button>
        </div>
      </div>

      <div className="setting-group">
        <label>回答方式</label>
        <div className="segmented">
          <button
            type="button"
            className={settings.answerMode === 'text' ? 'active' : ''}
            onClick={() => onUpdate({ answerMode: 'text' })}
          >
            文字按钮
          </button>
          <button
            type="button"
            className={settings.answerMode === 'piano' ? 'active' : ''}
            onClick={() => onUpdate({ answerMode: 'piano' })}
          >
            钢琴键盘
          </button>
        </div>
      </div>

      <div className="setting-group">
        <label>难度</label>
        <div className="segmented">
          <button
            type="button"
            className={settings.difficultyMode === 'natural' ? 'active' : ''}
            onClick={() => onUpdate({ difficultyMode: 'natural' })}
          >
            基础白键
          </button>
          <button
            type="button"
            className={settings.difficultyMode === 'chromatic' ? 'active' : ''}
            onClick={() => onUpdate({ difficultyMode: 'chromatic', answerMode: 'piano' })}
          >
            包含黑键
          </button>
        </div>
        <p className="setting-hint">选择包含黑键后，所有琴键音都可能出现。</p>
      </div>

      <button className="setting-row" type="button" onClick={() => onUpdate({ soundEnabled: !settings.soundEnabled })}>
        <div>
          <strong>音效</strong>
          <span>{settings.soundEnabled ? '答题时播放轻提示音' : '已关闭'}</span>
        </div>
        {settings.soundEnabled ? <Volume2 size={22} /> : <VolumeX size={22} />}
      </button>

      <div className="setting-group">
        <label>动画强度</label>
        <div className="segmented">
          <button
            type="button"
            className={settings.animationLevel === 'standard' ? 'active' : ''}
            onClick={() => onUpdate({ animationLevel: 'standard' })}
          >
            标准
          </button>
          <button
            type="button"
            className={settings.animationLevel === 'simple' ? 'active' : ''}
            onClick={() => onUpdate({ animationLevel: 'simple' })}
          >
            简洁
          </button>
        </div>
      </div>

      <button className="danger-button" type="button" onClick={onClear}>
        清空本地练习数据
      </button>
      <button className="setting-row privacy-row" type="button" onClick={onOpenPrivacy}>
        <div>
          <strong>隐私说明</strong>
          <span>查看本地数据保存和使用说明</span>
        </div>
        <ChevronRight size={20} />
      </button>
      <p className="fine-print">当前版本的练习历史保存在本机浏览器中，不会上传到服务器。</p>
    </section>
  )
}

function PrivacyView({ onBack }: { onBack: () => void }) {
  return (
    <section className="screen">
      <button className="text-button back-button" type="button" onClick={onBack}>
        返回设置
      </button>
      <ScreenHeader eyebrow="本地数据" title="隐私说明" />
      <div className="privacy-copy">
        <p>当前版本不提供账号登录，不收集姓名、手机号、定位、照片或通讯录等个人信息。</p>
        <p>练习设置、答题历史、星星、徽章和薄弱音统计保存在当前浏览器的本地存储中，用于显示进度和安排复习。</p>
        <p>更换设备、清理浏览器缓存或点击“清空本地练习数据”后，本地记录可能无法恢复。</p>
        <p>如果后续增加账号同步、家长报告、老师端或支付功能，需要重新补充隐私政策和用户协议。</p>
      </div>
    </section>
  )
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Star
  label: string
  value: string
}) {
  return (
    <div className="metric-card">
      <Icon aria-hidden="true" size={20} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function ScreenHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="screen-header">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>
}

function buildNoteDeck(
  notes: NoteItem[],
  progress: AppState['noteProgress'],
  requestedCount: number,
): string[] {
  const weightedNoteIds = notes
    .map((note) => ({
      noteId: note.id,
      priority: getNoteDeckPriority(note, progress),
    }))
    .sort((a, b) => b.priority - a.priority)
    .map((item) => item.noteId)

  return weightedNoteIds.slice(0, Math.min(requestedCount, weightedNoteIds.length))
}

function getNoteDeckPriority(note: NoteItem, progress: AppState['noteProgress']): number {
  const noteProgress = progress[note.id]
  const base = noteProgress ? 1 + noteProgress.wrongStreak * 4 + noteProgress.wrongAttempts * 0.35 : 8
  const freshness = Math.random()
  const slowBonus = noteProgress?.recentResponseTimesMs.slice(-4).some((time) => time > 5500) ? 2 : 0
  const masteredPenalty = noteProgress?.mastered ? 4 : 0
  return base + slowBonus + freshness - masteredPenalty
}

function getPlayableNoteId(note: NoteItem): string {
  return note.pitchId ?? note.id
}

function buildRhythmDeck(requestedCount: number): string[] {
  const shuffled = shuffleLocal(RHYTHM_PATTERNS.map((pattern) => pattern.id))
  return shuffled.slice(0, Math.min(requestedCount, shuffled.length))
}

function buildRhythmAnswerOptions(correctPatternId: string): string[] {
  const distractors = RHYTHM_ANSWER_OPTIONS.map((option) => option.id).filter((patternId) => patternId !== correctPatternId)
  const shuffledDistractors = shuffleLocal(distractors).slice(0, 3)
  return shuffleLocal([correctPatternId, ...shuffledDistractors])
}

function getSessionTitle(sessionType: SessionType | undefined, levelId: string): string {
  if (sessionType === 'rhythmTap') {
    return '节奏跟拍'
  }
  return sessionType === 'rhythm' ? '节奏型练习' : getLevel(levelId).title
}

function getTapBeats(pattern: RhythmPattern): number[] {
  const beats: number[] = []
  let cursor = 0

  for (const symbol of pattern.symbols) {
    if (!symbol.value.includes('Rest')) {
      beats.push(cursor)
    }
    cursor += symbol.beats
  }

  return beats
}

function getPrepBeat(prepStartedAt?: number, tapStartedAt?: number): number | undefined {
  if (!prepStartedAt || !tapStartedAt) {
    return undefined
  }

  const now = Date.now()
  if (now >= tapStartedAt) {
    return undefined
  }
  const elapsed = now - prepStartedAt
  return Math.min(TAP_PREP_BEATS, Math.max(1, Math.floor(elapsed / TAP_BEAT_MS) + 1))
}

function getTapOffset(tapBeats: number[], startedAt: number, tapTimes: number[]): number {
  const tapIndex = tapTimes.length - 1
  const beat = tapBeats[tapIndex] ?? tapBeats[tapBeats.length - 1] ?? 0
  return Math.round(tapTimes[tapIndex] - (startedAt + beat * TAP_BEAT_MS))
}

function getTapFeedback(offsetMs: number): TapFeedback {
  const absOffset = Math.abs(offsetMs)
  if (absOffset <= 110) {
    return { offsetMs, label: '很准', tone: 'good' }
  }
  if (offsetMs < 0) {
    return { offsetMs, label: '偏早', tone: 'early' }
  }
  return { offsetMs, label: '偏晚', tone: 'late' }
}

function scoreTapRhythm(tapBeats: number[], startedAt: number, tapTimes: number[]): TapResult {
  const offsets = tapBeats.map((beat, index) => Math.round((tapTimes[index] ?? Date.now()) - (startedAt + beat * TAP_BEAT_MS)))
  const absoluteOffsets = offsets.map((offset) => Math.abs(offset))
  const avgOffsetMs = absoluteOffsets.length
    ? Math.round(absoluteOffsets.reduce((sum, offset) => sum + offset, 0) / absoluteOffsets.length)
    : 999
  const maxOffsetMs = absoluteOffsets.length ? Math.max(...absoluteOffsets) : 999
  const score = Math.max(0, Math.round(100 - avgOffsetMs / 4 - Math.max(0, maxOffsetMs - 220) / 8))

  return {
    score,
    avgOffsetMs,
    maxOffsetMs,
    offsets,
    label: score >= 88 ? '很稳' : score >= 70 ? '基本稳住' : getTapHint(offsets),
  }
}

function getTapHint(offsets: number[]): string {
  if (offsets.length === 0) {
    return '还没有点拍'
  }
  const avg = offsets.reduce((sum, offset) => sum + offset, 0) / offsets.length
  if (avg < -120) {
    return '整体偏早'
  }
  if (avg > 120) {
    return '整体偏晚'
  }
  return '节拍有点散'
}

function shuffleLocal<T>(items: readonly T[]): T[] {
  const shuffled = [...items]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]]
  }
  return shuffled
}

function getBestCorrectStreak(records: AnswerRecord[]): number {
  let best = 0
  let current = 0

  for (const record of records) {
    current = record.isCorrect ? current + 1 : 0
    best = Math.max(best, current)
  }

  return best
}

function getTrailingCorrectStreak(records: AnswerRecord[]): number {
  let streak = 0

  for (let index = records.length - 1; index >= 0; index -= 1) {
    if (!records[index].isCorrect) {
      break
    }
    streak += 1
  }

  return streak
}

export default App
