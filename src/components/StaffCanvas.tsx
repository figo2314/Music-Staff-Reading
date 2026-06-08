import { useEffect, useRef } from 'react'
import type { NoteItem } from '../types'

interface StaffCanvasProps {
  note: NoteItem
  feedback: 'idle' | 'correct' | 'wrong'
}

export function StaffCanvas({ note, feedback }: StaffCanvasProps) {
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
      drawStaff(ctx, rect.width, rect.height, note, feedback)
    }

    draw()
    const resizeObserver = new ResizeObserver(draw)
    resizeObserver.observe(canvas)
    return () => resizeObserver.disconnect()
  }, [note, feedback])

  return <canvas ref={canvasRef} className="staff-canvas" aria-label="五线谱音符卡片" />
}

function drawStaff(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  note: NoteItem,
  feedback: 'idle' | 'correct' | 'wrong',
) {
  ctx.clearRect(0, 0, width, height)

  const left = Math.max(26, width * 0.08)
  const right = width - left
  const lineGap = Math.max(18, Math.min(25, width / 14))
  const topLineY = height / 2 - lineGap * 2
  const bottomLineY = topLineY + lineGap * 4
  const noteX = width * 0.6
  const noteY = bottomLineY - note.staffStep * (lineGap / 2)
  const highlight = feedback === 'correct' ? '#d9f4df' : feedback === 'wrong' ? '#ffe1dc' : '#eef8f6'

  ctx.save()
  ctx.fillStyle = highlight
  ctx.globalAlpha = feedback === 'idle' ? 0.46 : 0.82
  if (note.staffStep % 2 === 0) {
    roundRect(ctx, left - 8, noteY - 4, right - left + 16, 8, 4)
  } else {
    roundRect(ctx, left - 8, noteY - lineGap / 2, right - left + 16, lineGap, 8)
  }
  ctx.fill()
  ctx.restore()

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
  ctx.font = `${lineGap * 3.2}px Georgia, "Times New Roman", serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('𝄞', left + lineGap * 1.25, topLineY + lineGap * 2.3)

  drawLedgerLines(ctx, note, noteX, bottomLineY, lineGap)
  drawNoteHead(ctx, noteX, noteY, lineGap, feedback)
  drawStem(ctx, noteX, noteY, lineGap, note.staffStep)

  ctx.fillStyle = '#7a8791'
  ctx.font = `600 13px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
  ctx.textAlign = 'right'
  ctx.fillText('高音谱号', right, topLineY - lineGap * 1.05)
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
) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(-0.28)
  ctx.fillStyle = feedback === 'correct' ? '#138f63' : feedback === 'wrong' ? '#c74f45' : '#1d2730'
  ctx.beginPath()
  ctx.ellipse(0, 0, lineGap * 0.78, lineGap * 0.52, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawStem(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  lineGap: number,
  staffStep: number,
) {
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

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + width, y, x + width, y + height, radius)
  ctx.arcTo(x + width, y + height, x, y + height, radius)
  ctx.arcTo(x, y + height, x, y, radius)
  ctx.arcTo(x, y, x + width, y, radius)
  ctx.closePath()
}
