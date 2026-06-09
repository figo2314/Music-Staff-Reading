import type { AppState, NoteProgress } from '../types'

const STORAGE_KEY = 'staff_note_cards_state_v1'
const STORAGE_VERSION = 4

type PersistedAppState = Partial<AppState> & {
  storageVersion?: number
}

export const defaultAppState: AppState = {
  settings: {
    dailyQuestionCount: 15,
    noteLabelMode: 'fixedDo',
    answerMode: 'text',
    soundEnabled: true,
    animationLevel: 'standard',
    currentLevelId: 'treble-mix',
  },
  noteProgress: {},
  sessions: [],
  rewards: {
    totalStars: 0,
    streakDays: 0,
    badges: [],
    stickers: [],
  },
}

export function createEmptyProgress(noteId: string): NoteProgress {
  return {
    noteId,
    totalAttempts: 0,
    correctAttempts: 0,
    wrongAttempts: 0,
    currentStreak: 0,
    wrongStreak: 0,
    avgResponseTimeMs: 0,
    mastered: false,
    recentResults: [],
    recentResponseTimesMs: [],
  }
}

export function loadAppState(): AppState {
  if (typeof window === 'undefined') {
    return defaultAppState
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return defaultAppState
    }

    const parsed = JSON.parse(raw) as PersistedAppState
    const migratedSettings = {
      ...defaultAppState.settings,
      ...parsed.settings,
      noteLabelMode: parsed.storageVersion ? (parsed.settings?.noteLabelMode ?? defaultAppState.settings.noteLabelMode) : 'fixedDo',
      dailyQuestionCount:
        !parsed.storageVersion || parsed.storageVersion < 3
          ? 15
          : (parsed.settings?.dailyQuestionCount ?? defaultAppState.settings.dailyQuestionCount),
      currentLevelId:
        !parsed.storageVersion || parsed.storageVersion < 3
          ? 'treble-mix'
          : (parsed.settings?.currentLevelId ?? defaultAppState.settings.currentLevelId),
    }

    return {
      settings: migratedSettings,
      noteProgress: parsed.noteProgress ?? {},
      sessions: parsed.sessions ?? [],
      rewards: { ...defaultAppState.rewards, ...parsed.rewards },
    }
  } catch {
    return defaultAppState
  }
}

export function saveAppState(state: AppState): void {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, storageVersion: STORAGE_VERSION }))
}

export function resetAppState(): AppState {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(STORAGE_KEY)
  }

  return defaultAppState
}
