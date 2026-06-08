import { ANSWER_ORDER, getLevel, NOTES_BY_ID } from '../data/notes'
import { getLocalDateKey, getYesterdayKey } from './date'
import { createEmptyProgress } from './storage'
import type {
  AnswerRecord,
  AppState,
  Badge,
  NoteItem,
  NoteProgress,
  PracticeSession,
  PracticeSummary,
  RewardState,
  Sticker,
} from '../types'

export function getAvailableNotes(levelId: string, reviewOnly: boolean, progress: Record<string, NoteProgress>): NoteItem[] {
  const level = getLevel(levelId)
  const notes = level.noteIds.map((noteId) => NOTES_BY_ID[noteId]).filter(Boolean)

  if (!reviewOnly) {
    return notes
  }

  const weakNotes = notes.filter((note) => isWeakNote(progress[note.id]))
  return weakNotes.length > 0 ? weakNotes : notes
}

export function chooseWeightedNote(
  notes: NoteItem[],
  progress: Record<string, NoteProgress>,
  recentNoteIds: string[] = [],
): NoteItem {
  if (notes.length === 0) {
    throw new Error('No notes available for practice')
  }

  const recentSet = new Set(recentNoteIds)
  const unaskedNotes = notes.filter((note) => !recentSet.has(note.id))
  const lastNoteId = recentNoteIds.at(-1)
  const pool = unaskedNotes.length > 0 ? unaskedNotes : notes
  const candidateNotes = lastNoteId && pool.length > 1 ? pool.filter((note) => note.id !== lastNoteId) : pool
  const recentTwoNoteIds = recentNoteIds.slice(-2)

  const weighted = candidateNotes.map((note) => {
    const noteProgress = progress[note.id]
    const askedCount = recentNoteIds.filter((noteId) => noteId === note.id).length
    const recencyPenalty = recentTwoNoteIds.includes(note.id) ? 0.25 : 1
    const repetitionPenalty = askedCount > 0 ? 1 / (askedCount + 1) : 1

    return {
      note,
      weight: Math.max(0.1, getNoteWeight(noteProgress) * recencyPenalty * repetitionPenalty),
    }
  })
  const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0)
  let target = Math.random() * totalWeight

  for (const item of weighted) {
    target -= item.weight
    if (target <= 0) {
      return item.note
    }
  }

  return weighted[weighted.length - 1]?.note ?? notes[0]
}

export function getNoteWeight(progress?: NoteProgress): number {
  if (!progress || progress.totalAttempts === 0) {
    return 1
  }

  let weight = 1
  if (progress.wrongStreak > 0) {
    weight += 3 + progress.wrongStreak
  }
  if (progress.recentResults.slice(-5).some((result) => !result)) {
    weight += 2
  }
  if (progress.currentStreak >= 3) {
    weight -= 1
  }
  if (progress.lastPracticedAt) {
    const daysSince = (Date.now() - progress.lastPracticedAt) / 86400000
    if (daysSince >= 3) {
      weight += 1
    }
  }

  return Math.max(1, weight)
}

export function isWeakNote(progress?: NoteProgress): boolean {
  if (!progress || progress.totalAttempts < 3) {
    return false
  }

  const recent = progress.recentResults.slice(-10)
  const recentAccuracy = recent.filter(Boolean).length / recent.length
  const slowRecent = progress.recentResponseTimesMs.slice(-5).some((time) => time > 5500)
  return progress.wrongStreak >= 2 || recentAccuracy < 0.7 || slowRecent
}

export function getWeakNoteIds(progress: Record<string, NoteProgress>): string[] {
  return Object.values(progress)
    .filter((item) => isWeakNote(item))
    .map((item) => item.noteId)
}

export function buildAnswerOptions(): typeof ANSWER_ORDER {
  return ANSWER_ORDER
}

export function finishPracticeSession(state: AppState, records: AnswerRecord[], levelId: string, startedAt: number): {
  state: AppState
  summary: PracticeSummary
} {
  const endedAt = Date.now()
  const correctCount = records.filter((record) => record.isCorrect).length
  const avgResponseTimeMs = records.length
    ? Math.round(records.reduce((sum, record) => sum + record.responseTimeMs, 0) / records.length)
    : 0
  const earnedStars = getEarnedStars(correctCount, records.length)
  const session: PracticeSession = {
    id: `session-${startedAt}`,
    startedAt,
    endedAt,
    levelId,
    questionCount: records.length,
    correctCount,
    avgResponseTimeMs,
    earnedStars,
    records,
  }

  const noteProgress = { ...state.noteProgress }
  for (const record of records) {
    const existing = noteProgress[record.noteId] ?? createEmptyProgress(record.noteId)
    noteProgress[record.noteId] = updateProgress(existing, record)
  }

  const sessions = [session, ...state.sessions].slice(0, 90)
  const { rewards, newBadges, newStickers } = updateRewards(state.rewards, sessions, noteProgress, session)
  const nextState: AppState = {
    ...state,
    noteProgress,
    sessions,
    rewards,
  }

  return {
    state: nextState,
    summary: {
      session,
      newBadges,
      newStickers,
      weakNoteIds: getWeakNoteIds(noteProgress),
    },
  }
}

function updateProgress(progress: NoteProgress, record: AnswerRecord): NoteProgress {
  const totalAttempts = progress.totalAttempts + 1
  const correctAttempts = progress.correctAttempts + (record.isCorrect ? 1 : 0)
  const wrongAttempts = progress.wrongAttempts + (record.isCorrect ? 0 : 1)
  const avgResponseTimeMs = Math.round(
    (progress.avgResponseTimeMs * progress.totalAttempts + record.responseTimeMs) / totalAttempts,
  )
  const recentResults = [...progress.recentResults, record.isCorrect].slice(-12)
  const recentResponseTimesMs = [...progress.recentResponseTimesMs, record.responseTimeMs].slice(-12)
  const currentStreak = record.isCorrect ? progress.currentStreak + 1 : 0
  const wrongStreak = record.isCorrect ? 0 : progress.wrongStreak + 1
  const recentEight = recentResults.slice(-8)
  const mastered =
    totalAttempts >= 8 &&
    currentStreak >= 3 &&
    recentEight.length >= 8 &&
    recentEight.filter(Boolean).length / recentEight.length >= 0.85

  return {
    ...progress,
    totalAttempts,
    correctAttempts,
    wrongAttempts,
    currentStreak,
    wrongStreak,
    avgResponseTimeMs,
    lastPracticedAt: record.answeredAt,
    mastered,
    recentResults,
    recentResponseTimesMs,
  }
}

function getEarnedStars(correctCount: number, questionCount: number): number {
  if (questionCount === 0) {
    return 0
  }
  const rate = correctCount / questionCount
  if (rate >= 0.95) {
    return 3
  }
  if (rate >= 0.8) {
    return 2
  }
  if (rate >= 0.6) {
    return 1
  }
  return 0
}

function updateRewards(
  rewards: RewardState,
  sessions: PracticeSession[],
  progress: Record<string, NoteProgress>,
  session: PracticeSession,
): {
  rewards: RewardState
  newBadges: Badge[]
  newStickers: Sticker[]
} {
  const today = getLocalDateKey()
  const yesterday = getYesterdayKey()
  const alreadyPracticedToday = rewards.lastPracticeDate === today
  const streakDays = alreadyPracticedToday
    ? rewards.streakDays
    : rewards.lastPracticeDate === yesterday
      ? rewards.streakDays + 1
      : 1

  const badgeMap = new Map(rewards.badges.map((badge) => [badge.id, badge]))
  const stickerMap = new Map(rewards.stickers.map((sticker) => [sticker.id, sticker]))
  const newBadges: Badge[] = []
  const newStickers: Sticker[] = []
  const masteredCount = Object.values(progress).filter((item) => item.mastered).length
  const perfectSession = session.questionCount > 0 && session.correctCount === session.questionCount

  const unlockBadge = (id: string, name: string, description: string) => {
    if (badgeMap.has(id)) {
      return
    }
    const badge = { id, name, description, unlockedAt: Date.now() }
    badgeMap.set(id, badge)
    newBadges.push(badge)
  }

  const unlockSticker = (id: string, name: string, description: string) => {
    if (stickerMap.has(id)) {
      return
    }
    const sticker = { id, name, description, unlockedAt: Date.now() }
    stickerMap.set(id, sticker)
    newStickers.push(sticker)
  }

  if (sessions.length >= 1) {
    unlockBadge('first-practice', '第一张乐谱', '完成第一次认谱练习')
  }
  if (streakDays >= 3) {
    unlockBadge('streak-3', '三天连练', '连续练习 3 天')
  }
  if (streakDays >= 7) {
    unlockBadge('streak-7', '一周小乐手', '连续练习 7 天')
  }
  if (perfectSession) {
    unlockBadge('first-perfect', '全对时刻', '完成一次全对练习')
    unlockSticker('gold-star', '金色星星', '一次全对获得')
  }
  if (masteredCount >= 5) {
    unlockSticker('five-notes', '五音花环', '掌握 5 个音')
  }
  if (masteredCount >= 10) {
    unlockSticker('ten-notes', '小舞台', '掌握 10 个音')
  }

  return {
    rewards: {
      totalStars: rewards.totalStars + session.earnedStars,
      streakDays,
      lastPracticeDate: today,
      badges: Array.from(badgeMap.values()),
      stickers: Array.from(stickerMap.values()),
    },
    newBadges,
    newStickers,
  }
}
