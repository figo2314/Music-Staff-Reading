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
import { MelodyStaff } from './components/MelodyStaff'
import { PianoKeyboard } from './components/PianoKeyboard'
import { RhythmStaff } from './components/RhythmStaff'
import { StaffCanvas } from './components/StaffCanvas'
import { getLevel, getNoteDisplay, getNoteLabel, LEVELS, NATURAL_TREBLE_NOTES, NOTES_BY_ID } from './data/notes'
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
  isContrast?: boolean
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

interface MelodyQuestionState {
  kind: 'melody'
  id: string
  notes: NoteItem[]
  startedAt: number
  currentStep: number
}

type QuestionState = NoteQuestionState | RhythmQuestionState | RhythmTapQuestionState | MelodyQuestionState

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
  pendingContrastNoteId?: string
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

interface PracticeDiagnosis {
  title: string
  detail: string
}

interface PracticeReport {
  weakText: string
  quickText: string
  slowText: string
  nextText: string
}

const TAP_BEAT_MS = 667
const TAP_PREP_BEATS = 4
const MELODY_ID_SEPARATOR = '|'
const SMART_DECK_SEPARATOR = ':'

type SmartDeckKind = 'note' | 'rhythm' | 'melody'
type SmartStage = 'warmup' | 'weak' | 'rhythm' | 'melody' | 'challenge'

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
      (session) =>
        ((session.sessionType ?? 'note') === 'note' || session.sessionType === 'smart') &&
        getLocalDateKey(new Date(session.startedAt)) === today,
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
    setPractice({
      sessionType: 'note',
      mode,
      levelId,
      total: noteDeck.length,
      startedAt: Date.now(),
      records: [],
      questionDeck: noteDeck,
      currentIndex: 0,
      question: createNoteQuestion(noteDeck[0], includeAccidentals),
      feedback: 'idle',
      questionHadWrong: false,
    })
    setView('practice')
  }

  const startSmartPractice = () => {
    clearAdvanceTimer()
    const includeAccidentals = state.settings.difficultyMode === 'chromatic'
    const notes = getAvailableNotes(state.settings.currentLevelId, false, state.noteProgress, includeAccidentals)
    const smartDeck = buildSmartDeck(notes, state.noteProgress, state.settings.dailyQuestionCount)
    setPractice({
      sessionType: 'smart',
      mode: 'daily',
      levelId: 'smart-daily',
      total: smartDeck.length,
      startedAt: Date.now(),
      records: [],
      questionDeck: smartDeck,
      currentIndex: 0,
      question: createQuestionFromDeckItem(smartDeck[0], includeAccidentals),
      feedback: 'idle',
      questionHadWrong: false,
    })
    setView('practice')
  }

  const startRhythmPractice = () => {
    clearAdvanceTimer()
    const rhythmDeck = buildRhythmDeck(state.settings.dailyQuestionCount)
    setPractice({
      sessionType: 'rhythm',
      mode: 'daily',
      levelId: 'rhythm-basic',
      total: rhythmDeck.length,
      startedAt: Date.now(),
      records: [],
      questionDeck: rhythmDeck,
      currentIndex: 0,
      question: createRhythmQuestion(rhythmDeck[0]),
      feedback: 'idle',
      questionHadWrong: false,
    })
    setView('practice')
  }

  const startRhythmTapPractice = () => {
    clearAdvanceTimer()
    const rhythmDeck = buildRhythmDeck(state.settings.dailyQuestionCount)
    setPractice({
      sessionType: 'rhythmTap',
      mode: 'daily',
      levelId: 'rhythm-tap-basic',
      total: rhythmDeck.length,
      startedAt: Date.now(),
      records: [],
      questionDeck: rhythmDeck,
      currentIndex: 0,
      question: createRhythmTapQuestion(rhythmDeck[0]),
      feedback: 'idle',
      questionHadWrong: false,
      tapTimes: [],
      tapFeedbacks: [],
    })
    setView('practice')
  }

  const startMelodyPractice = () => {
    clearAdvanceTimer()
    const notes = getAvailableNotes(state.settings.currentLevelId, false, state.noteProgress, false)
    const melodyDeck = buildMelodyDeck(notes, 5)
    setPractice({
      sessionType: 'melody',
      mode: 'daily',
      levelId: 'melody-basic',
      total: melodyDeck.length,
      startedAt: Date.now(),
      records: [],
      questionDeck: melodyDeck,
      currentIndex: 0,
      question: createMelodyQuestion(melodyDeck[0]),
      feedback: 'idle',
      questionHadWrong: false,
    })
    setView('practice')
  }

  const answerQuestion = (answer: string, selectedNoteId?: string) => {
    if (!practice || practice.feedback !== 'idle') {
      return
    }

    let isCorrect: boolean
    let playedNoteId: string | undefined
    if (practice.question.kind === 'note') {
      isCorrect = answer === practice.question.note.name
      playedNoteId = getPlayableNoteId(practice.question.note)
    } else if (practice.question.kind === 'rhythm' || practice.question.kind === 'rhythmTap') {
      isCorrect = answer === practice.question.rhythm.id
    } else {
      return
    }

    if (state.settings.soundEnabled) {
      if (selectedNoteId && playedNoteId) {
        playPianoNote(playedNoteId)
      }
      if (!isCorrect) {
        playFeedbackTone('wrong')
      } else if (!selectedNoteId) {
        playFeedbackTone('correct')
      }
    }

    if (!isCorrect) {
      const pendingContrastNoteId =
        practice.question.kind === 'note'
          ? getContrastNoteId(practice.question.note, answer as AnswerName, currentLevel.noteIds)
          : practice.pendingContrastNoteId
      setPractice({
        ...practice,
        feedback: 'wrong',
        questionHadWrong: true,
        selectedAnswer: answer,
        selectedNoteId,
        pendingContrastNoteId,
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

        if (records.length >= current.total && !current.pendingContrastNoteId) {
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

        const nextIndex = current.currentIndex + 1
        const includeAccidentals = state.settings.difficultyMode === 'chromatic'
        const contrastNoteId = current.pendingContrastNoteId
        return {
          ...current,
          records,
          total: contrastNoteId ? current.total + 1 : current.total,
          currentIndex: contrastNoteId ? current.currentIndex : nextIndex,
          selectedAnswer: undefined,
          selectedNoteId: undefined,
          feedback: 'idle',
          questionHadWrong: false,
          pendingContrastNoteId: undefined,
          question:
            contrastNoteId && NOTES_BY_ID[contrastNoteId]
              ? createNoteQuestion(contrastNoteId, includeAccidentals, true)
              : current.sessionType === 'smart'
                ? createQuestionFromDeckItem(current.questionDeck[nextIndex], includeAccidentals)
                : current.sessionType === 'rhythm'
                  ? createRhythmQuestion(current.questionDeck[nextIndex])
                  : createNoteQuestion(current.questionDeck[nextIndex], includeAccidentals),
        }
      })
    }, state.settings.animationLevel === 'simple' ? 450 : 760)
  }

  const answerMelodyStep = (selectedAnswer: string) => {
    if (!practice || practice.question.kind !== 'melody' || practice.feedback !== 'idle') {
      return
    }

    const question = practice.question
    const currentNote = question.notes[question.currentStep]
    const correctNoteId = getPlayableNoteId(currentNote)
    const isCorrect = selectedAnswer === currentNote.name

    if (state.settings.soundEnabled) {
      playPianoNote(correctNoteId)
      if (!isCorrect) {
        playFeedbackTone('wrong')
      }
    }

    if (!isCorrect) {
      setPractice({
        ...practice,
        feedback: 'wrong',
        questionHadWrong: true,
        selectedAnswer,
        selectedNoteId: selectedAnswer,
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
      }, state.settings.animationLevel === 'simple' ? 500 : 850)
      return
    }

    const isLastStep = question.currentStep >= question.notes.length - 1

    if (!isLastStep) {
      setPractice({
        ...practice,
        feedback: 'correct',
        selectedAnswer,
        selectedNoteId: selectedAnswer,
      })

      const practiceStartedAt = practice.startedAt
      advanceTimerRef.current = window.setTimeout(() => {
        advanceTimerRef.current = null
        setPractice((current) =>
          current && current.startedAt === practiceStartedAt && current.question.kind === 'melody'
            ? {
                ...current,
                question: {
                  ...current.question,
                  currentStep: current.question.currentStep + 1,
                },
                feedback: 'idle',
                selectedAnswer: undefined,
                selectedNoteId: undefined,
              }
            : current,
        )
      }, state.settings.animationLevel === 'simple' ? 220 : 360)
      return
    }

    const melodyId = question.notes.map((note) => getPlayableNoteId(note)).join(MELODY_ID_SEPARATOR)
    const record: AnswerRecord = {
      questionId: question.id,
      noteId: melodyId,
      selectedAnswer: melodyId,
      selectedNoteId: selectedAnswer,
      correctAnswer: melodyId,
      correctNoteId: correctNoteId,
      isCorrect: !practice.questionHadWrong,
      responseTimeMs: Date.now() - question.startedAt,
      answeredAt: Date.now(),
    }
    const records = [...practice.records, record]

    setPractice({
      ...practice,
      records,
      feedback: 'correct',
      selectedAnswer,
      selectedNoteId: selectedAnswer,
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

        const nextIndex = current.currentIndex + 1
        const includeAccidentals = state.settings.difficultyMode === 'chromatic'
        return {
          ...current,
          records,
          currentIndex: nextIndex,
          selectedAnswer: undefined,
          selectedNoteId: undefined,
          feedback: 'idle',
          questionHadWrong: false,
          question:
            current.sessionType === 'smart'
              ? createQuestionFromDeckItem(current.questionDeck[nextIndex], includeAccidentals)
              : createMelodyQuestion(current.questionDeck[nextIndex]),
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
            diagnosis={getPracticeDiagnosis(state.noteProgress, weakNoteIds)}
            onStart={startSmartPractice}
            onStartRhythm={startRhythmPractice}
            onStartRhythmTap={startRhythmTapPractice}
            onStartMelody={startMelodyPractice}
            onReview={() => startPractice('review')}
            onOpenHistory={() => setView('history')}
          />
        )}

        {view === 'practice' && practice && (
          <PracticeView
            practice={practice}
            labelMode={state.settings.noteLabelMode}
            answerMode={state.settings.answerMode}
            noteProgress={state.noteProgress}
            onAnswer={answerQuestion}
            onMelodyAnswer={answerMelodyStep}
            onTapStart={startTapQuestion}
            onTapBeat={tapRhythmBeat}
            onTapSubmit={submitTapQuestion}
            onRestart={() =>
              practice.sessionType === 'rhythmTap'
                ? startRhythmTapPractice()
                : practice.sessionType === 'rhythm'
                  ? startRhythmPractice()
                  : practice.sessionType === 'melody'
                    ? startMelodyPractice()
                    : practice.sessionType === 'smart'
                      ? startSmartPractice()
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
  diagnosis,
  onStart,
  onStartRhythm,
  onStartRhythmTap,
  onStartMelody,
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
  diagnosis: PracticeDiagnosis
  onStart: () => void
  onStartRhythm: () => void
  onStartRhythmTap: () => void
  onStartMelody: () => void
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
          开始智能练习
          <ChevronRight aria-hidden="true" size={20} />
        </button>
        <div className="coach-panel">
          <BarChart3 aria-hidden="true" size={20} />
          <div>
            <strong>{diagnosis.title}</strong>
            <span>{diagnosis.detail}</span>
          </div>
        </div>
        <details className="advanced-practice">
          <summary>
            <span>专项练习</span>
            <ChevronRight aria-hidden="true" size={18} />
          </summary>
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
            <button className="mode-row" type="button" onClick={onStartMelody}>
              <Music2 aria-hidden="true" size={19} />
              <span>
                <strong>小旋律练习</strong>
                <small>看谱后按顺序弹</small>
              </span>
            </button>
          </div>
        </details>
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
  noteProgress,
  onAnswer,
  onMelodyAnswer,
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
  noteProgress: AppState['noteProgress']
  onAnswer: (answer: string, selectedNoteId?: string) => void
  onMelodyAnswer: (selectedNoteId: string) => void
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
  const melodyQuestion = practice.question.kind === 'melody' ? practice.question : undefined
  const isRhythmPractice = Boolean(rhythmQuestion || rhythmTapQuestion)
  const correctAnswer =
    rhythmQuestion?.rhythm.id ??
    rhythmTapQuestion?.rhythm.id ??
    noteQuestion?.note.name ??
    melodyQuestion?.notes[melodyQuestion.currentStep]?.name ??
    ''
  const answeredCount = practice.records.length
  const progress = practice.summary ? 100 : Math.round((answeredCount / practice.total) * 100)
  const handlePianoClick = (answer: string) => onAnswer(answer as AnswerName, answer)
  const combo = getTrailingCorrectStreak(practice.records)
  const tapTargetCount = rhythmTapQuestion?.tapBeats.length ?? 0
  const tapCount = practice.tapTimes?.length ?? 0
  const prepBeat = getPrepBeat(practice.tapPrepStartedAt, practice.tapStartedAt)
  const smartStage = practice.sessionType === 'smart' ? getSmartStage(practice.questionDeck[practice.currentIndex]) : undefined
  const noteHintLevel = noteQuestion ? getHintLevel(noteQuestion.note, noteProgress) : 'full'
  const melodyHintLevel = melodyQuestion
    ? getHintLevel(melodyQuestion.notes[melodyQuestion.currentStep], noteProgress)
    : 'full'

  if (practice.summary) {
    const session = practice.summary.session
    const accuracy = session.questionCount ? Math.round((session.correctCount / session.questionCount) * 100) : 0
    const bestStreak = getBestCorrectStreak(session.records)
    const report = getPracticeReport(session.records)
    return (
      <section className="screen finish-screen">
        <div className="finish-burst" aria-hidden="true">
          <Star fill="currentColor" />
          <Sparkles />
          <Star fill="currentColor" />
        </div>
        <p className="celebration-title">太棒了！</p>
        <h1>
          {practice.sessionType === 'smart'
            ? '完成智能练习'
            : practice.sessionType === 'rhythmTap'
              ? '完成跟拍'
              : `完成${isRhythmPractice ? '节奏' : '练习'}`}
        </h1>
        <p className="muted">
          {practice.sessionType === 'smart'
            ? '认音、节奏和短旋律都照顾到了。'
            : practice.sessionType === 'rhythmTap'
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
        <div className="practice-report">
          <h2>练习报告</h2>
          <div>
            <strong>易错点</strong>
            <span>{report.weakText}</span>
          </div>
          <div>
            <strong>快速掌握</strong>
            <span>{report.quickText}</span>
          </div>
          <div>
            <strong>反应速度</strong>
            <span>{report.slowText}</span>
          </div>
          <div>
            <strong>下次建议</strong>
            <span>{report.nextText}</span>
          </div>
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
        <div className="practice-progress">
          {smartStage && <span className="stage-pill">{getStageLabel(smartStage)}</span>}
          <div className="progress-bar" aria-label={`练习进度 ${progress}%`}>
            <span style={{ width: `${progress}%` }} />
          </div>
        </div>
        <strong>{Math.min(answeredCount + 1, practice.total)}/{practice.total}</strong>
      </div>

      <div className={`note-card ${practice.feedback}`}>
        {rhythmQuestion ? (
          <RhythmStaff pattern={rhythmQuestion.rhythm} feedback={practice.feedback} />
        ) : rhythmTapQuestion ? (
          <RhythmStaff pattern={rhythmTapQuestion.rhythm} feedback={practice.feedback} />
        ) : melodyQuestion ? (
          <MelodyStaff notes={melodyQuestion.notes} currentStep={melodyQuestion.currentStep} feedback={practice.feedback} />
        ) : noteQuestion ? (
          <StaffCanvas note={noteQuestion.note} feedback={practice.feedback} />
        ) : null}
        {practice.feedback === 'correct' &&
          combo >= 2 &&
          (!melodyQuestion || melodyQuestion.currentStep === melodyQuestion.notes.length - 1) && (
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
          <div className="prompt-stack">
            <span>
              {rhythmTapQuestion
                ? practice.tapStartedAt
                  ? prepBeat
                    ? `预备拍 ${prepBeat}`
                    : `按谱面点拍：${tapCount}/${tapTargetCount}`
                  : '先看节奏，准备好就开始跟拍'
                : melodyQuestion
                  ? `${getMelodyDirectionLabel(melodyQuestion.notes)} · 第 ${melodyQuestion.currentStep + 1}/${melodyQuestion.notes.length} 个音`
                : isRhythmPractice
                  ? '这一小节是哪种节奏？'
                  : noteQuestion?.isContrast
                    ? '对比一下：这次看清楚音的位置'
                    : '这个音是什么？'}
            </span>
            {(noteQuestion || melodyQuestion) && <small>速度目标：5 秒内稳定答对</small>}
          </div>
        )}
        {practice.feedback === 'correct' && (
          <span className="correct-text">
            <Check size={18} /> 答对了，
            {rhythmTapQuestion
              ? practice.tapResult?.label
              : isRhythmPractice
                ? RHYTHM_PATTERNS_BY_ID[correctAnswer]?.countText
                : melodyQuestion
                  ? melodyQuestion.currentStep >= melodyQuestion.notes.length - 1
                    ? '完成这句小旋律'
                    : '继续，下一个'
                : noteQuestion
                  ? getNoteDisplay(noteQuestion.note, labelMode)
                : ''}
          </span>
        )}
        {practice.feedback === 'wrong' && melodyQuestion && (
          <span className="wrong-text">
            <Sparkles size={18} /> 第 {melodyQuestion.currentStep + 1} 个音再试一次
          </span>
        )}
        {practice.feedback === 'wrong' && !melodyQuestion && (
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
      ) : melodyQuestion ? (
        <PianoKeyboard
          disabled={practice.feedback !== 'idle'}
          feedback={practice.feedback}
          labelMode={labelMode}
          selectedNoteId={practice.selectedNoteId}
          correctAnswer={melodyQuestion.notes[melodyQuestion.currentStep].name}
          registerLabel={getRegisterLabel(melodyQuestion.notes[melodyQuestion.currentStep])}
          hintLevel={melodyHintLevel}
          onPianoClick={onMelodyAnswer}
        />
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
            correctAnswer={noteQuestion.note.name}
            registerLabel={getRegisterLabel(noteQuestion.note)}
            hintLevel={noteHintLevel}
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

function buildSmartDeck(
  notes: NoteItem[],
  progress: AppState['noteProgress'],
  requestedCount: number,
): string[] {
  const total = Math.max(5, requestedCount)
  const weakNotes = notes.filter((note) => isWeakNote(progress[note.id]))
  const warmupCount = Math.max(1, Math.round(total * 0.2))
  const weakCount = weakNotes.length > 0 ? Math.max(1, Math.round(total * 0.25)) : 0
  const rhythmCount = Math.max(1, Math.round(total * 0.15))
  const melodyCount = Math.max(1, Math.round(total * 0.2))
  const challengeCount = Math.max(1, total - warmupCount - weakCount - rhythmCount - melodyCount)

  const noteDeck = buildNoteDeck(notes, progress, warmupCount + challengeCount + weakCount)
  const weakDeck = weakNotes.length > 0 ? buildNoteDeck(weakNotes, progress, weakCount) : []
  const rhythmDeck = buildRhythmDeck(rhythmCount)
  const melodyDeck = buildMelodyDeck(notes, melodyCount)
  const warmupDeck = noteDeck.slice(0, warmupCount)
  const challengeDeck = noteDeck.slice(warmupCount, warmupCount + challengeCount)
  const smartItems = [
    ...warmupDeck.map((noteId) => createSmartDeckItem('warmup', 'note', noteId)),
    ...weakDeck.map((noteId) => createSmartDeckItem('weak', 'note', noteId)),
    ...rhythmDeck.map((rhythmId) => createSmartDeckItem('rhythm', 'rhythm', rhythmId)),
    ...melodyDeck.map((melodyId) => createSmartDeckItem('melody', 'melody', melodyId)),
    ...challengeDeck.map((noteId) => createSmartDeckItem('challenge', 'note', noteId)),
  ]

  const uniqueItems = Array.from(new Set(smartItems))
  if (uniqueItems.length >= total) {
    return uniqueItems.slice(0, total)
  }

  const fallbackDeck = buildNoteDeck(notes, progress, total).map((noteId) => createSmartDeckItem('challenge', 'note', noteId))
  return Array.from(new Set([...uniqueItems, ...fallbackDeck])).slice(0, total)
}

function createSmartDeckItem(stage: SmartStage, kind: SmartDeckKind, id: string): string {
  return `${stage}${SMART_DECK_SEPARATOR}${kind}${SMART_DECK_SEPARATOR}${id}`
}

function parseSmartDeckItem(item: string): { stage?: SmartStage; kind: SmartDeckKind; id: string } {
  const [first, second, ...rest] = item.split(SMART_DECK_SEPARATOR)
  if (!second) {
    return { kind: 'note', id: item }
  }
  if (!rest.length) {
    return { kind: first as SmartDeckKind, id: second }
  }
  return {
    stage: first as SmartStage,
    kind: second as SmartDeckKind,
    id: rest.join(SMART_DECK_SEPARATOR),
  }
}

function createQuestionFromDeckItem(deckItem: string, includeAccidentals: boolean): QuestionState {
  const item = parseSmartDeckItem(deckItem)
  if (item.kind === 'rhythm') {
    return createRhythmQuestion(item.id)
  }
  if (item.kind === 'melody') {
    return createMelodyQuestion(item.id)
  }
  return createNoteQuestion(item.id, includeAccidentals)
}

function getSmartStage(deckItem: string): SmartStage | undefined {
  return parseSmartDeckItem(deckItem).stage
}

function getStageLabel(stage: SmartStage): string {
  const labels: Record<SmartStage, string> = {
    warmup: '热身',
    weak: '薄弱音',
    rhythm: '节奏',
    melody: '小旋律',
    challenge: '挑战',
  }
  return labels[stage]
}

function createNoteQuestion(noteId: string, includeAccidentals: boolean, isContrast = false): NoteQuestionState {
  return {
    kind: 'note',
    id: `q-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    note: NOTES_BY_ID[noteId],
    startedAt: Date.now(),
    answerOptions: buildAnswerOptions(includeAccidentals),
    isContrast,
  }
}

function createRhythmQuestion(rhythmId: string): RhythmQuestionState {
  const rhythm = RHYTHM_PATTERNS_BY_ID[rhythmId]
  return {
    kind: 'rhythm',
    id: `r-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    rhythm,
    startedAt: Date.now(),
    answerOptions: buildRhythmAnswerOptions(rhythm.id),
  }
}

function createRhythmTapQuestion(rhythmId: string): RhythmTapQuestionState {
  const rhythm = RHYTHM_PATTERNS_BY_ID[rhythmId]
  return {
    kind: 'rhythmTap',
    id: `t-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    rhythm,
    startedAt: Date.now(),
    tapBeats: getTapBeats(rhythm),
  }
}

function getNoteDeckPriority(note: NoteItem, progress: AppState['noteProgress']): number {
  const noteProgress = progress[note.id]
  const base = noteProgress ? 1 + noteProgress.wrongStreak * 4 + noteProgress.wrongAttempts * 0.35 : 8
  const freshness = Math.random()
  const slowBonus = noteProgress?.recentResponseTimesMs.slice(-4).some((time) => time > 5500) ? 2 : 0
  const masteredPenalty = noteProgress?.mastered ? 4 : 0
  return base + slowBonus + freshness - masteredPenalty
}

function getPracticeDiagnosis(progress: AppState['noteProgress'], weakNoteIds: string[]): PracticeDiagnosis {
  if (weakNoteIds.length === 0) {
    return {
      title: '今日智能练习',
      detail: '会自动混合认音、节奏和小旋律，保持入口简单。',
    }
  }

  const weakNotes = weakNoteIds.map((noteId) => NOTES_BY_ID[noteId]).filter(Boolean)
  const slowCount = weakNoteIds.filter((noteId) =>
    progress[noteId]?.recentResponseTimesMs.slice(-5).some((time) => time > 5500),
  ).length
  const wrongStreakCount = weakNoteIds.filter((noteId) => (progress[noteId]?.wrongStreak ?? 0) >= 2).length
  const adjacentPair = getAdjacentWeakPair(weakNotes)

  if (adjacentPair) {
    return {
      title: '相邻音容易混淆',
      detail: `${adjacentPair[0]} 和 ${adjacentPair[1]} 会被放进今日练习里多对比几次。`,
    }
  }
  if (wrongStreakCount > 0) {
    return {
      title: '先修正连续错音',
      detail: `有 ${wrongStreakCount} 个音最近连续答错，今日练习会优先安排它们。`,
    }
  }
  if (slowCount > 0) {
    return {
      title: '提升反应速度',
      detail: `有 ${slowCount} 个音答得偏慢，今天会用短题组帮它们变熟。`,
    }
  }
  return {
    title: '薄弱音复习',
    detail: `现在有 ${weakNoteIds.length} 个音需要多练，智能练习会自动穿插。`,
  }
}

function getAdjacentWeakPair(notes: NoteItem[]): [string, string] | undefined {
  const byClef = new Map<string, NoteItem[]>()
  for (const note of notes) {
    const group = byClef.get(note.clef) ?? []
    group.push(note)
    byClef.set(note.clef, group)
  }

  for (const group of byClef.values()) {
    const sorted = [...group].sort((a, b) => a.staffStep - b.staffStep)
    for (let index = 1; index < sorted.length; index += 1) {
      if (Math.abs(sorted[index].staffStep - sorted[index - 1].staffStep) <= 1) {
        return [getNoteDisplay(sorted[index - 1], 'letter'), getNoteDisplay(sorted[index], 'letter')]
      }
    }
  }

  return undefined
}

function getContrastNoteId(note: NoteItem, selectedAnswer: AnswerName, levelNoteIds: string[]): string | undefined {
  const levelNotes = levelNoteIds.map((noteId) => NOTES_BY_ID[noteId]).filter(Boolean)
  const sameClefNotes = levelNotes.filter((item) => item.clef === note.clef && item.id !== note.id)
  const selectedNameMatch = sameClefNotes.find((item) => item.name === selectedAnswer)
  if (selectedNameMatch) {
    return selectedNameMatch.id
  }

  const adjacentNotes = sameClefNotes
    .map((item) => ({
      note: item,
      distance: Math.abs(item.staffStep - note.staffStep),
    }))
    .filter((item) => item.distance > 0)
    .sort((a, b) => a.distance - b.distance)

  return adjacentNotes[0]?.note.id
}

function getPlayableNoteId(note: NoteItem): string {
  return note.pitchId ?? note.id
}

function getRegisterLabel(note: NoteItem): string {
  const pitchId = getPlayableNoteId(note)
  const register =
    note.octave <= 3 ? '低音区' : note.octave === 4 && note.staffStep <= 5 ? '中央音区' : '高音区'
  return `${register} · ${pitchId}`
}

function getHintLevel(note: NoteItem, progress: AppState['noteProgress']): 'full' | 'reduced' {
  const item = progress[note.id]
  if (!item || item.totalAttempts < 6 || item.wrongStreak > 0) {
    return 'full'
  }
  const recent = item.recentResults.slice(-6)
  const recentAccuracy = recent.length ? recent.filter(Boolean).length / recent.length : 0
  const recentSlow = item.recentResponseTimesMs.slice(-4).some((time) => time > 5500)
  return item.mastered || (recent.length >= 4 && recentAccuracy >= 0.85 && !recentSlow) ? 'reduced' : 'full'
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

function buildMelodyDeck(notes: NoteItem[], requestedCount: number): string[] {
  const naturalNotes = notes.filter((note) => !note.accidental)
  const clefGroups = groupMelodyNotesByClef(naturalNotes)
  const bestGroup = clefGroups.sort((a, b) => b.length - a.length)[0]
  const sourceNotes = bestGroup && bestGroup.length >= 5 ? bestGroup : NATURAL_TREBLE_NOTES
  const orderedNotes = [...sourceNotes].sort((a, b) => a.staffStep - b.staffStep)
  const patterns: string[] = []

  for (let index = 0; index <= orderedNotes.length - 3; index += 1) {
    patterns.push(createMelodyId([orderedNotes[index], orderedNotes[index + 1], orderedNotes[index + 2]]))
  }
  for (let index = 2; index < orderedNotes.length; index += 1) {
    patterns.push(createMelodyId([orderedNotes[index], orderedNotes[index - 1], orderedNotes[index - 2]]))
  }
  for (let index = 0; index <= orderedNotes.length - 3; index += 1) {
    patterns.push(createMelodyId([orderedNotes[index], orderedNotes[index + 2], orderedNotes[index + 1]]))
  }

  const uniquePatterns = Array.from(new Set(patterns))
  return shuffleLocal(uniquePatterns).slice(0, Math.min(requestedCount, uniquePatterns.length))
}

function groupMelodyNotesByClef(notes: NoteItem[]): NoteItem[][] {
  const groups = new Map<string, NoteItem[]>()
  for (const note of notes) {
    const group = groups.get(note.clef) ?? []
    group.push(note)
    groups.set(note.clef, group)
  }
  return Array.from(groups.values())
}

function createMelodyQuestion(melodyId: string): MelodyQuestionState {
  return {
    kind: 'melody',
    id: `m-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    notes: melodyId.split(MELODY_ID_SEPARATOR).map((noteId) => NOTES_BY_ID[noteId]).filter(Boolean),
    startedAt: Date.now(),
    currentStep: 0,
  }
}

function createMelodyId(notes: NoteItem[]): string {
  return notes.map((note) => note.id).join(MELODY_ID_SEPARATOR)
}

function getMelodyDirectionLabel(notes: NoteItem[]): string {
  if (notes.length < 2) {
    return '小旋律'
  }
  const intervals = notes.slice(1).map((note, index) => note.staffStep - notes[index].staffStep)
  const allUp = intervals.every((step) => step > 0)
  const allDown = intervals.every((step) => step < 0)
  const hasSkip = intervals.some((step) => Math.abs(step) >= 2)
  if (allUp && hasSkip) {
    return '上行跳进'
  }
  if (allDown && hasSkip) {
    return '下行跳进'
  }
  if (allUp) {
    return '上行级进'
  }
  if (allDown) {
    return '下行级进'
  }
  return hasSkip ? '转向跳进' : '转向级进'
}

function getSessionTitle(sessionType: SessionType | undefined, levelId: string): string {
  if (sessionType === 'smart') {
    return '智能今日练习'
  }
  if (sessionType === 'melody') {
    return '小旋律练习'
  }
  if (sessionType === 'rhythmTap') {
    return '节奏跟拍'
  }
  return sessionType === 'rhythm' ? '节奏型练习' : getLevel(levelId).title
}

function getPracticeReport(records: AnswerRecord[]): PracticeReport {
  const noteRecords = records.filter((record) => NOTES_BY_ID[record.noteId])
  const wrongNoteIds = noteRecords.filter((record) => !record.isCorrect).map((record) => record.noteId)
  const quickRecords = noteRecords.filter((record) => record.isCorrect && record.responseTimeMs <= 3000)
  const slowRecords = noteRecords.filter((record) => record.responseTimeMs > 5500)
  const weakText = getTopNoteText(wrongNoteIds, '本轮没有明显易错音')
  const quickText =
    quickRecords.length > 0
      ? `${getTopNoteText(
          quickRecords.map((record) => record.noteId),
          '',
        )} 已经比较熟。`
      : '还没有特别快的音，先把准确率稳定下来。'
  const slowText =
    slowRecords.length > 0
      ? `${getTopNoteText(
          slowRecords.map((record) => record.noteId),
          '',
        )} 反应偏慢，可以下次先热身。`
      : '反应速度不错，继续保持。'
  const nextText = getNextPracticeAdvice(noteRecords, wrongNoteIds, slowRecords)

  return {
    weakText,
    quickText,
    slowText,
    nextText,
  }
}

function getTopNoteText(noteIds: string[], fallback: string): string {
  if (noteIds.length === 0) {
    return fallback
  }
  const counts = new Map<string, number>()
  for (const noteId of noteIds) {
    counts.set(noteId, (counts.get(noteId) ?? 0) + 1)
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([noteId]) => getNoteDisplay(NOTES_BY_ID[noteId], 'letter'))
    .join('、')
}

function getNextPracticeAdvice(
  noteRecords: AnswerRecord[],
  wrongNoteIds: string[],
  slowRecords: AnswerRecord[],
): string {
  if (wrongNoteIds.length > 0) {
    return `下次先练 ${getTopNoteText(wrongNoteIds, '')}，再做小旋律。`
  }
  if (slowRecords.length > 0) {
    return '音基本认得出来了，下一步把每题反应压到 5 秒内。'
  }
  if (noteRecords.length === 0) {
    return '这轮以节奏或旋律为主，下次可以穿插几题单音识谱。'
  }
  return '可以进入下一组混合练习，保持每天短时间高质量练习。'
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
