import type { RhythmPattern, RhythmValue } from '../types'

export const RHYTHM_PATTERNS: RhythmPattern[] = [
  {
    id: 'steady-quarters',
    title: '四个四分音符',
    subtitle: '一拍一拍很平均',
    countText: '1 2 3 4',
    symbols: [
      { value: 'quarter', beats: 1 },
      { value: 'quarter', beats: 1 },
      { value: 'quarter', beats: 1 },
      { value: 'quarter', beats: 1 },
    ],
    accent: '#18a999',
  },
  {
    id: 'two-halves',
    title: '两个二分音符',
    subtitle: '每个音保持两拍',
    countText: '1-2 3-4',
    symbols: [
      { value: 'half', beats: 2 },
      { value: 'half', beats: 2 },
    ],
    accent: '#5a8dee',
  },
  {
    id: 'whole-note',
    title: '一个全音符',
    subtitle: '一个音唱满四拍',
    countText: '1-2-3-4',
    symbols: [{ value: 'whole', beats: 4 }],
    accent: '#f6b23b',
  },
  {
    id: 'half-and-quarters',
    title: '二分加四分',
    subtitle: '长音后接两个短音',
    countText: '1-2 3 4',
    symbols: [
      { value: 'half', beats: 2 },
      { value: 'quarter', beats: 1 },
      { value: 'quarter', beats: 1 },
    ],
    accent: '#8f7ae5',
  },
  {
    id: 'quarter-rest-walk',
    title: '四分休止符',
    subtitle: '有一拍安静下来',
    countText: '1 2 休 4',
    symbols: [
      { value: 'quarter', beats: 1 },
      { value: 'quarter', beats: 1 },
      { value: 'quarterRest', beats: 1 },
      { value: 'quarter', beats: 1 },
    ],
    accent: '#ef766f',
  },
  {
    id: 'eighth-pair',
    title: '八分音符一组',
    subtitle: '两个小音合成一拍',
    countText: '1-& 2 3 4',
    symbols: [
      { value: 'eighth', beats: 0.5 },
      { value: 'eighth', beats: 0.5 },
      { value: 'quarter', beats: 1 },
      { value: 'quarter', beats: 1 },
      { value: 'quarter', beats: 1 },
    ],
    accent: '#d78316',
  },
  {
    id: 'half-rest-and-half',
    title: '二分休止再进入',
    subtitle: '前两拍休息，后两拍弹奏',
    countText: '休-休 3-4',
    symbols: [
      { value: 'halfRest', beats: 2 },
      { value: 'half', beats: 2 },
    ],
    accent: '#4b8f88',
  },
]

export const RHYTHM_PATTERNS_BY_ID = RHYTHM_PATTERNS.reduce<Record<string, RhythmPattern>>((acc, pattern) => {
  acc[pattern.id] = pattern
  return acc
}, {})

export const RHYTHM_ANSWER_OPTIONS = RHYTHM_PATTERNS.map((pattern) => ({
  id: pattern.id,
  title: pattern.title,
  countText: pattern.countText,
}))

export const rhythmLabelByValue: Record<RhythmValue, string> = {
  quarter: '四分音符',
  half: '二分音符',
  whole: '全音符',
  eighth: '八分音符',
  quarterRest: '四分休止符',
  halfRest: '二分休止符',
}
