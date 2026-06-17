import { useEffect, useRef } from 'react'
import type { NoteItem } from '../types'

interface MelodyStaffProps {
  notes: NoteItem[]
  currentStep: number
  feedback: 'idle' | 'correct' | 'wrong'
}

export function MelodyStaff({ notes, currentStep, feedback }: MelodyStaffProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    const draw = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.max(1, Math.floor(rect.width * dpr))
      canvas.height = Math.max(1, Math.floor(rect.height * dpr))

      const ctx = canvas.getContext('2d')
      if (!ctx) {
        return
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      drawMelody(ctx, rect.width, rect.height, notes, currentStep, feedback)
    }

    draw()
    const resizeObserver = new ResizeObserver(draw)
    resizeObserver.observe(canvas)
    return () => resizeObserver.disconnect()
  }, [notes, currentStep, feedback])

  return <canvas ref={canvasRef} className="melody-staff" aria-label="melody staff" />
}

function drawMelody(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  notes: NoteItem[],
  currentStep: number,
  feedback: 'idle' | 'correct' | 'wrong',
) {
  ctx.clearRect(0, 0, width, height)

  const left = Math.max(28, width * 0.08)
  const right = width - left
  const lineGap = Math.max(18, Math.min(25, width / 16))
  const topLineY = height / 2 - lineGap * 2
  const bottomLineY = topLineY + lineGap * 4
  const clef = notes[0]?.clef ?? 'treble'
  const noteAreaLeft = left + lineGap * 3.3
  const noteAreaRight = right - lineGap * 1.2
  const noteCount = Math.max(1, notes.length)

  ctx.strokeStyle = '#26313b'
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  for (let i = 0; i < 5; i += 1) {
    const y = topLineY + i * lineGap
    ctx.beginPath()
    ctx.moveTo(left, y)
    ctx.lineTo(right, y)
    ctx.stroke()
  }

  ctx.fillStyle = '#23313a'
  ctx.font = `${lineGap * (clef === 'bass' ? 2.8 : 3.2)}px Georgia, "Times New Roman", serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(clef === 'bass' ? '𝄢' : '𝄞', left + lineGap * 1.25, topLineY + lineGap * 2.3)

  notes.forEach((note, index) => {
    const x = noteAreaLeft + ((noteAreaRight - noteAreaLeft) * (index + 0.5)) / noteCount
    const y = bottomLineY - note.staffStep * (lineGap / 2)
    const isCurrent = index === currentStep
    const isComplete = index < currentStep
    const stepFeedback = isCurrent ? feedback : isComplete ? 'correct' : 'idle'

    if (isCurrent) {
      drawStepHighlight(ctx, left, right, y, lineGap, feedback)
    }
    drawLedgerLines(ctx, note, x, bottomLineY, lineGap)
    if (note.accidental === '#') {
      drawSharp(ctx, x - lineGap * 1.5, y, lineGap)
    }
    drawNoteHead(ctx, x, y, lineGap, stepFeedback, isCurrent)
    drawStem(ctx, x, y, lineGap, note.staffStep)
    drawStepNumber(ctx, x, bottomLineY + lineGap * 1.7, index + 1, isCurrent, isComplete)
  })

  ctx.fillStyle = '#7a8791'
  ctx.font = `600 13px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
  ctx.textAlign = 'right'
  ctx.fillText(clef === 'bass' ? 'Bass clef' : 'Treble clef', right, topLineY - lineGap * 1.05)
}

function drawStepHighlight(
  ctx: CanvasRenderingContext2D,
  left: number,
  right: number,
  noteY: number,
  lineGap: number,
  feedback: 'idle' | 'correct' | 'wrong',
) {
  ctx.save()
  ctx.fillStyle = feedback === 'wrong' ? '#fff3cf' : feedback === 'correct' ? '#d9f4df' : '#eef8f6'
  ctx.globalAlpha = feedback === 'idle' ? 0.5 : 0.85
  roundRect(ctx, left - 8, noteY - lineGap * 0.58, right - left + 16, lineGap * 1.16, 8)
  ctx.fill()
  ctx.restore()
}

function drawSharp(ctx: CanvasRenderingContext2D, x: number, y: number, lineGap: number) {
  ctx.save()
  ctx.fillStyle = '#26313b'
  ctx.font = `700 ${lineGap * 1.8}px Georgia, "Times New Roman", serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('♯', x, y)
  ctx.restore()
}

function drawLedgerLines(
  ctx: CanvasRenderingContext2D,
  note: NoteItem,
  noteX: number,
  bottomLineY: number,
  lineGap: number,
) {
  const ledgerSteps = note.ledgerLines ?? []
  if (ledgerSteps.length === 0) {
    return
  }

  ctx.strokeStyle = '#26313b'
  ctx.lineWidth = 2
  for (const step of ledgerSteps) {
    const y = bottomLineY - step * (lineGap / 2)
    ctx.beginPath()
    ctx.moveTo(noteX - lineGap * 0.95, y)
    ctx.lineTo(noteX + lineGap * 0.95, y)
    ctx.stroke()
  }
}

function drawNoteHead(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  lineGap: number,
  feedback: 'idle' | 'correct' | 'wrong',
  isCurrent: boolean,
) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(-0.28)
  ctx.fillStyle = feedback === 'correct' ? '#138f63' : feedback === 'wrong' ? '#8d6b2b' : '#1d2730'
  ctx.beginPath()
  ctx.ellipse(0, 0, lineGap * 0.78, lineGap * 0.52, 0, 0, Math.PI * 2)
  ctx.fill()
  if (isCurrent) {
    ctx.lineWidth = 3
    ctx.strokeStyle = feedback === 'wrong' ? '#f1b43a' : '#18a999'
    ctx.stroke()
  }
  ctx.restore()
}

function drawStem(ctx: CanvasRenderingContext2D, x: number, y: number, lineGap: number, staffStep: number) {
  ctx.strokeStyle = '#1d2730'
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  ctx.beginPath()
  if (staffStep >= 4) {
    ctx.moveTo(x - lineGap * 0.6, y)
    ctx.lineTo(x - lineGap * 0.6, y + lineGap * 3)
  } else {
    ctx.moveTo(x + lineGap * 0.6, y)
    ctx.lineTo(x + lineGap * 0.6, y - lineGap * 3)
  }
  ctx.stroke()
}

function drawStepNumber(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  step: number,
  isCurrent: boolean,
  isComplete: boolean,
) {
  ctx.save()
  ctx.fillStyle = isCurrent ? '#168779' : isComplete ? '#138f63' : '#94a3aa'
  ctx.font = `800 14px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(step), x, y)
  ctx.restore()
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + width, y, x + width, y + height, radius)
  ctx.arcTo(x + width, y + height, x, y + height, radius)
  ctx.arcTo(x, y + height, x, y, radius)
  ctx.arcTo(x, y, x + width, y, radius)
  ctx.closePath()
}
