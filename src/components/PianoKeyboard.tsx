import { getNoteLabel } from '../data/notes'
import type { AnswerName, NoteLabelMode, NoteName } from '../types'

interface PianoKey {
  id: string
  answer: AnswerName
  kind: 'white' | 'black'
  whiteIndex?: number
}

interface PianoKeyboardProps {
  disabled: boolean
  feedback: 'idle' | 'correct' | 'wrong'
  labelMode: NoteLabelMode
  selectedNoteId?: string
  correctAnswer: AnswerName
  registerLabel: string
  onPianoClick: (note: string) => void
}

const WHITE_KEYS: PianoKey[] = [
  { id: 'C', answer: 'C', kind: 'white' },
  { id: 'D', answer: 'D', kind: 'white' },
  { id: 'E', answer: 'E', kind: 'white' },
  { id: 'F', answer: 'F', kind: 'white' },
  { id: 'G', answer: 'G', kind: 'white' },
  { id: 'A', answer: 'A', kind: 'white' },
  { id: 'B', answer: 'B', kind: 'white' },
]

const BLACK_KEYS: PianoKey[] = [
  { id: 'C#', answer: 'C#', kind: 'black', whiteIndex: 1 },
  { id: 'D#', answer: 'D#', kind: 'black', whiteIndex: 2 },
  { id: 'F#', answer: 'F#', kind: 'black', whiteIndex: 4 },
  { id: 'G#', answer: 'G#', kind: 'black', whiteIndex: 5 },
  { id: 'A#', answer: 'A#', kind: 'black', whiteIndex: 6 },
]

export function PianoKeyboard({
  disabled,
  feedback,
  labelMode,
  selectedNoteId,
  correctAnswer,
  registerLabel,
  onPianoClick,
}: PianoKeyboardProps) {
  return (
    <div className="piano-wrap">
      <div className="piano-register-hint">
        <strong>当前音区</strong>
        <span>{registerLabel}</span>
      </div>
      <div className="piano-keyboard" aria-label="虚拟钢琴键盘">
        <div className="piano-white-keys">
          {WHITE_KEYS.map((key) => (
            <button
              key={key.id}
              type="button"
              className={getKeyClassName(key, feedback, selectedNoteId, correctAnswer)}
              data-note={key.id}
              disabled={disabled}
              aria-label={key.id}
              onClick={() => onPianoClick(key.answer)}
            >
              <span>{getNoteLabel(key.answer as NoteName, labelMode)}</span>
              <small>{key.answer}</small>
            </button>
          ))}
        </div>
        {BLACK_KEYS.map((key) => (
          <button
            key={key.id}
            type="button"
            className={getKeyClassName(key, feedback, selectedNoteId, correctAnswer)}
            data-note={key.id}
            disabled={disabled}
            aria-label={key.id}
            style={{ left: `${((key.whiteIndex ?? 0) / WHITE_KEYS.length) * 100}%` }}
            onClick={() => onPianoClick(key.answer)}
          />
        ))}
      </div>
    </div>
  )
}

function getKeyClassName(
  key: PianoKey,
  feedback: PianoKeyboardProps['feedback'],
  selectedNoteId: string | undefined,
  correctAnswer: AnswerName,
): string {
  const isSelected = selectedNoteId === key.answer
  const isCorrect = feedback !== 'idle' && key.answer === correctAnswer
  const isWrongSelected = feedback === 'wrong' && isSelected

  return [
    'piano-key',
    key.kind,
    isCorrect ? 'correct' : '',
    isCorrect && feedback === 'wrong' ? 'hint' : '',
    isWrongSelected ? 'wrong' : '',
    isSelected ? 'selected' : '',
  ]
    .filter(Boolean)
    .join(' ')
}
