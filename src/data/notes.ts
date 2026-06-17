import type { AnswerName, LevelConfig, NoteItem, NoteLabelMode } from '../types'

export const ANSWER_ORDER: AnswerName[] = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

const fixedDoLabels: Record<AnswerName, string> = {
  C: 'Do',
  'C#': 'Do♯',
  D: 'Re',
  'D#': 'Re♯',
  E: 'Mi',
  F: 'Fa',
  'F#': 'Fa♯',
  G: 'Sol',
  'G#': 'Sol♯',
  A: 'La',
  'A#': 'La♯',
  B: 'Si',
}

export const NATURAL_TREBLE_NOTES: NoteItem[] = [
  { id: 'C4', clef: 'treble', name: 'C', octave: 4, labelFixedDo: 'Do', staffStep: -2, ledgerLines: [-2] },
  { id: 'D4', clef: 'treble', name: 'D', octave: 4, labelFixedDo: 'Re', staffStep: -1 },
  { id: 'E4', clef: 'treble', name: 'E', octave: 4, labelFixedDo: 'Mi', staffStep: 0 },
  { id: 'F4', clef: 'treble', name: 'F', octave: 4, labelFixedDo: 'Fa', staffStep: 1 },
  { id: 'G4', clef: 'treble', name: 'G', octave: 4, labelFixedDo: 'Sol', staffStep: 2 },
  { id: 'A4', clef: 'treble', name: 'A', octave: 4, labelFixedDo: 'La', staffStep: 3 },
  { id: 'B4', clef: 'treble', name: 'B', octave: 4, labelFixedDo: 'Si', staffStep: 4 },
  { id: 'C5', clef: 'treble', name: 'C', octave: 5, labelFixedDo: 'Do', staffStep: 5 },
  { id: 'D5', clef: 'treble', name: 'D', octave: 5, labelFixedDo: 'Re', staffStep: 6 },
  { id: 'E5', clef: 'treble', name: 'E', octave: 5, labelFixedDo: 'Mi', staffStep: 7 },
  { id: 'F5', clef: 'treble', name: 'F', octave: 5, labelFixedDo: 'Fa', staffStep: 8 },
  { id: 'G5', clef: 'treble', name: 'G', octave: 5, labelFixedDo: 'Sol', staffStep: 9 },
  { id: 'A5', clef: 'treble', name: 'A', octave: 5, labelFixedDo: 'La', staffStep: 10 },
]

export const NATURAL_BASS_NOTES: NoteItem[] = [
  { id: 'bass-C3', pitchId: 'C3', clef: 'bass', name: 'C', octave: 3, labelFixedDo: 'Do', staffStep: -2, ledgerLines: [-2] },
  { id: 'bass-D3', pitchId: 'D3', clef: 'bass', name: 'D', octave: 3, labelFixedDo: 'Re', staffStep: -1 },
  { id: 'bass-E3', pitchId: 'E3', clef: 'bass', name: 'E', octave: 3, labelFixedDo: 'Mi', staffStep: 0 },
  { id: 'bass-F3', pitchId: 'F3', clef: 'bass', name: 'F', octave: 3, labelFixedDo: 'Fa', staffStep: 1 },
  { id: 'bass-G3', pitchId: 'G3', clef: 'bass', name: 'G', octave: 3, labelFixedDo: 'Sol', staffStep: 2 },
  { id: 'bass-A3', pitchId: 'A3', clef: 'bass', name: 'A', octave: 3, labelFixedDo: 'La', staffStep: 3 },
  { id: 'bass-B3', pitchId: 'B3', clef: 'bass', name: 'B', octave: 3, labelFixedDo: 'Si', staffStep: 4 },
  { id: 'bass-C4', pitchId: 'C4', clef: 'bass', name: 'C', octave: 4, labelFixedDo: 'Do', staffStep: 5 },
]

export const ACCIDENTAL_TREBLE_NOTES: NoteItem[] = NATURAL_TREBLE_NOTES.flatMap((note) =>
  ['E', 'B'].includes(note.name) || note.id === 'A5'
    ? []
    : [
        {
          ...note,
          id: `${note.name}#${note.octave}`,
          name: `${note.name}#` as AnswerName,
          labelFixedDo: `${note.labelFixedDo}♯`,
          accidental: '#' as const,
        },
      ],
)

export const TREBLE_NOTES = [...NATURAL_TREBLE_NOTES, ...ACCIDENTAL_TREBLE_NOTES]
export const BASS_NOTES = [...NATURAL_BASS_NOTES]
export const ALL_NOTES = [...TREBLE_NOTES, ...BASS_NOTES]

export const NOTES_BY_ID = ALL_NOTES.reduce<Record<string, NoteItem>>((acc, note) => {
  acc[note.id] = note
  return acc
}, {})

export const LEVELS: LevelConfig[] = [
  {
    id: 'line-notes',
    title: '线上的音',
    subtitle: 'E G B D F',
    noteIds: ['E4', 'G4', 'B4', 'D5', 'F5'],
    accent: '#18a999',
  },
  {
    id: 'space-notes',
    title: '间上的音',
    subtitle: 'F A C E',
    noteIds: ['F4', 'A4', 'C5', 'E5'],
    accent: '#f6b23b',
  },
  {
    id: 'middle-c-to-g',
    title: '中央 C 到 G',
    subtitle: 'C D E F G',
    noteIds: ['C4', 'D4', 'E4', 'F4', 'G4'],
    accent: '#5a8dee',
  },
  {
    id: 'upper-a-to-c',
    title: 'A 到高音 C',
    subtitle: 'A B C',
    noteIds: ['A4', 'B4', 'C5'],
    accent: '#ef766f',
  },
  {
    id: 'treble-mix',
    title: '高音谱号混合',
    subtitle: 'C 到 F 全部混合',
    noteIds: NATURAL_TREBLE_NOTES.map((note) => note.id),
    accent: '#8f7ae5',
  },
  {
    id: 'bass-foundation',
    title: '低音谱号基础',
    subtitle: '低音 C 到中央 C',
    noteIds: NATURAL_BASS_NOTES.map((note) => note.id),
    accent: '#5a8dee',
  },
  {
    id: 'grand-staff-foundation',
    title: '双谱表基础',
    subtitle: '高音与低音混合',
    noteIds: [...NATURAL_BASS_NOTES.map((note) => note.id), ...NATURAL_TREBLE_NOTES.slice(0, 8).map((note) => note.id)],
    accent: '#d78316',
  },
]

export function getLevel(levelId: string): LevelConfig {
  return LEVELS.find((level) => level.id === levelId) ?? LEVELS[0]
}

export function getNoteLabel(noteName: AnswerName, mode: NoteLabelMode): string {
  return mode === 'fixedDo' ? fixedDoLabels[noteName] : noteName
}

export function getNoteDisplay(note: NoteItem, mode: NoteLabelMode): string {
  return mode === 'fixedDo' ? note.labelFixedDo : `${note.name}${note.octave}`
}
