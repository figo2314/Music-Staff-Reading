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
  correctNoteId: string
  onPianoClick: (note: string) => void
}

const WHITE_KEYS: PianoKey[] = [
  { id: 'C3', answer: 'C', kind: 'white' },
  { id: 'D3', answer: 'D', kind: 'white' },
  { id: 'E3', answer: 'E', kind: 'white' },
  { id: 'F3', answer: 'F', kind: 'white' },
  { id: 'G3', answer: 'G', kind: 'white' },
  { id: 'A3', answer: 'A', kind: 'white' },
  { id: 'B3', answer: 'B', kind: 'white' },
  { id: 'C4', answer: 'C', kind: 'white' },
  { id: 'D4', answer: 'D', kind: 'white' },
  { id: 'E4', answer: 'E', kind: 'white' },
  { id: 'F4', answer: 'F', kind: 'white' },
  { id: 'G4', answer: 'G', kind: 'white' },
  { id: 'A4', answer: 'A', kind: 'white' },
  { id: 'B4', answer: 'B', kind: 'white' },
  { id: 'C5', answer: 'C', kind: 'white' },
  { id: 'D5', answer: 'D', kind: 'white' },
  { id: 'E5', answer: 'E', kind: 'white' },
  { id: 'F5', answer: 'F', kind: 'white' },
  { id: 'G5', answer: 'G', kind: 'white' },
  { id: 'A5', answer: 'A', kind: 'white' },
]

const BLACK_KEYS: PianoKey[] = [
  { id: 'C#3', answer: 'C#', kind: 'black', whiteIndex: 1 },
  { id: 'D#3', answer: 'D#', kind: 'black', whiteIndex: 2 },
  { id: 'F#3', answer: 'F#', kind: 'black', whiteIndex: 4 },
  { id: 'G#3', answer: 'G#', kind: 'black', whiteIndex: 5 },
  { id: 'A#3', answer: 'A#', kind: 'black', whiteIndex: 6 },
  { id: 'C#4', answer: 'C#', kind: 'black', whiteIndex: 8 },
  { id: 'D#4', answer: 'D#', kind: 'black', whiteIndex: 9 },
  { id: 'F#4', answer: 'F#', kind: 'black', whiteIndex: 11 },
  { id: 'G#4', answer: 'G#', kind: 'black', whiteIndex: 12 },
  { id: 'A#4', answer: 'A#', kind: 'black', whiteIndex: 13 },
  { id: 'C#5', answer: 'C#', kind: 'black', whiteIndex: 15 },
  { id: 'D#5', answer: 'D#', kind: 'black', whiteIndex: 16 },
  { id: 'F#5', answer: 'F#', kind: 'black', whiteIndex: 18 },
  { id: 'G#5', answer: 'G#', kind: 'black', whiteIndex: 19 },
]

export function PianoKeyboard({
  disabled,
  feedback,
  labelMode,
  selectedNoteId,
  correctNoteId,
  onPianoClick,
}: PianoKeyboardProps) {
  return (
    <div className="piano-wrap">
      <div className="piano-keyboard" aria-label="虚拟钢琴键盘">
        <div className="piano-white-keys">
          {WHITE_KEYS.map((key) => (
            <button
              key={key.id}
              type="button"
              className={getKeyClassName(key, feedback, selectedNoteId, correctNoteId)}
              data-note={key.id}
              disabled={disabled}
              aria-label={key.id}
              onClick={() => onPianoClick(key.id)}
            >
              <span>{getNoteLabel(key.answer as NoteName, labelMode)}</span>
              {key.answer === 'C' && <small>{key.id}</small>}
            </button>
          ))}
        </div>
        {BLACK_KEYS.map((key) => (
          <button
            key={key.id}
            type="button"
            className={getKeyClassName(key, feedback, selectedNoteId, correctNoteId)}
            data-note={key.id}
            disabled={disabled}
            aria-label={key.id}
            style={{ left: `${((key.whiteIndex ?? 0) / WHITE_KEYS.length) * 100}%` }}
            onClick={() => onPianoClick(key.id)}
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
  correctNoteId: string,
): string {
  const isSelected = selectedNoteId === key.id
  const isCorrect = feedback !== 'idle' && key.id === correctNoteId
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
