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
  Trophy,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import './App.css'
import { PianoKeyboard } from './components/PianoKeyboard'
import { StaffCanvas } from './components/StaffCanvas'
import { getLevel, getNoteDisplay, getNoteLabel, LEVELS, NOTES_BY_ID } from './data/notes'
import { playFeedbackTone } from './lib/audio'
import { formatShortDate, getLocalDateKey } from './lib/date'
import {
  buildAnswerOptions,
  chooseWeightedNote,
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
  NoteName,
  PracticeMode,
  PracticeSummary,
  UserSettings,
  ViewName,
} from './types'

interface QuestionState {
  id: string
  note: NoteItem
  startedAt: number
  answerOptions: NoteName[]
}

interface PracticeState {
  mode: PracticeMode
  levelId: string
  total: number
  startedAt: number
  records: AnswerRecord[]
  question: QuestionState
  feedback: 'idle' | 'correct' | 'wrong'
  selectedAnswer?: AnswerName
  selectedNoteId?: string
  summary?: PracticeSummary
}

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

  const todaySessions = useMemo(() => {
    const today = getLocalDateKey()
    return state.sessions.filter((session) => getLocalDateKey(new Date(session.startedAt)) === today)
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
    const notes = getAvailableNotes(levelId, mode === 'review', state.noteProgress)
    const questionNote = chooseWeightedNote(notes, state.noteProgress)
    setPractice({
      mode,
      levelId,
      total: state.settings.dailyQuestionCount,
      startedAt: Date.now(),
      records: [],
      question: {
        id: `q-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        note: questionNote,
        startedAt: Date.now(),
        answerOptions: buildAnswerOptions(),
      },
      feedback: 'idle',
    })
    setView('practice')
  }

  const answerQuestion = (answer: AnswerName, selectedNoteId?: string) => {
    if (!practice || practice.feedback !== 'idle') {
      return
    }

    const isCorrect = selectedNoteId ? selectedNoteId === practice.question.note.id : answer === practice.question.note.name
    const record: AnswerRecord = {
      questionId: practice.question.id,
      noteId: practice.question.note.id,
      selectedAnswer: answer,
      selectedNoteId,
      correctAnswer: practice.question.note.name,
      correctNoteId: practice.question.note.id,
      isCorrect,
      responseTimeMs: Date.now() - practice.question.startedAt,
      answeredAt: Date.now(),
    }
    const records = [...practice.records, record]

    if (state.settings.soundEnabled) {
      playFeedbackTone(isCorrect ? 'correct' : 'wrong')
    }

    setPractice({
      ...practice,
      records,
      feedback: isCorrect ? 'correct' : 'wrong',
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
          const result = finishPracticeSession(state, records, current.levelId, current.startedAt)
          setState(result.state)
          if (state.settings.soundEnabled) {
            playFeedbackTone('complete')
          }
          return {
            ...current,
            records,
            feedback: isCorrect ? 'correct' : 'wrong',
            summary: result.summary,
          }
        }

        const simulatedProgress = resultlessProgressPreview(state, records)
        const notes = getAvailableNotes(current.levelId, current.mode === 'review', simulatedProgress)
        const recentNoteIds = records.map((item) => item.noteId)
        const nextNote = chooseWeightedNote(notes, simulatedProgress, recentNoteIds)
        return {
          ...current,
          records,
          selectedAnswer: undefined,
          selectedNoteId: undefined,
          feedback: 'idle',
          question: {
            id: `q-${Date.now()}-${Math.random().toString(16).slice(2)}`,
            note: nextNote,
            startedAt: Date.now(),
            answerOptions: buildAnswerOptions(),
          },
        }
      })
    }, state.settings.animationLevel === 'simple' ? 450 : 760)
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
            currentLevelTitle={currentLevel.title}
            todayAnswered={todayAnswered}
            todayCorrect={todayCorrect}
            totalTarget={state.settings.dailyQuestionCount}
            streakDays={state.rewards.streakDays}
            totalStars={state.rewards.totalStars}
            weakCount={weakNoteIds.length}
            masteredCount={masteredCount}
            onStart={() => startPractice('daily')}
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
            onRestart={() => startPractice(practice.mode, practice.levelId)}
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

      <div className="primary-actions">
        <button className="primary-button" type="button" onClick={onStart}>
          <Music2 aria-hidden="true" size={22} />
          开始今日练习
          <ChevronRight aria-hidden="true" size={20} />
        </button>
        <button className="secondary-button" type="button" onClick={onReview} disabled={weakCount === 0}>
          <RotateCcw aria-hidden="true" size={19} />
          {weakCount > 0 ? `复习薄弱音（${weakCount}）` : '暂无薄弱音需要复习'}
        </button>
      </div>

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
  onRestart,
  onHome,
  onHistory,
}: {
  practice: PracticeState
  labelMode: AppState['settings']['noteLabelMode']
  answerMode: AppState['settings']['answerMode']
  onAnswer: (answer: AnswerName, selectedNoteId?: string) => void
  onRestart: () => void
  onHome: () => void
  onHistory: () => void
}) {
  const correctAnswer = practice.question.note.name
  const answeredCount = practice.records.length
  const progress = practice.summary ? 100 : Math.round((answeredCount / practice.total) * 100)
  const handlePianoClick = (noteId: string) => onAnswer(noteId.replace(/\d/g, '') as AnswerName, noteId)

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
        <h1>完成练习</h1>
        <p className="muted">今天的小舞台已经点亮。</p>
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
        <StaffCanvas note={practice.question.note} feedback={practice.feedback} />
      </div>

      <div className="feedback-zone">
        {practice.feedback === 'idle' && <span>这个音是什么？</span>}
        {practice.feedback === 'correct' && (
          <span className="correct-text">
            <Check size={18} /> 答对了，{getNoteDisplay(practice.question.note, labelMode)}
          </span>
        )}
        {practice.feedback === 'wrong' && (
          <span className="wrong-text">
            <X size={18} /> 正确答案是 {getNoteLabel(correctAnswer, labelMode)}
          </span>
        )}
      </div>

      {answerMode === 'text' ? (
        <div className="answer-grid">
          {practice.question.answerOptions.map((answer) => {
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
        <PianoKeyboard
          disabled={practice.feedback !== 'idle'}
          feedback={practice.feedback}
          labelMode={labelMode}
          selectedNoteId={practice.selectedNoteId}
          correctNoteId={practice.question.note.id}
          onPianoClick={handlePianoClick}
        />
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
                  <span>{getLevel(session.levelId).title}</span>
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
                {note ? `${note.name}${note.octave}` : item.noteId}
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

function resultlessProgressPreview(state: AppState, records: AnswerRecord[]) {
  const preview = { ...state.noteProgress }
  for (const record of records) {
    const existing = preview[record.noteId]
    if (!existing) {
      continue
    }
    preview[record.noteId] = {
      ...existing,
      wrongStreak: record.isCorrect ? 0 : existing.wrongStreak + 1,
      currentStreak: record.isCorrect ? existing.currentStreak + 1 : 0,
      recentResults: [...existing.recentResults, record.isCorrect].slice(-12),
      recentResponseTimesMs: [...existing.recentResponseTimesMs, record.responseTimeMs].slice(-12),
    }
  }
  return preview
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

export default App
