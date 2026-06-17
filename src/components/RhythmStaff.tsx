import { rhythmLabelByValue } from '../data/rhythms'
import type { RhythmPattern, RhythmSymbol } from '../types'

const NOTE_Y = 112

export function RhythmStaff({ pattern, feedback }: { pattern: RhythmPattern; feedback: 'idle' | 'correct' | 'wrong' }) {
  const totalBeats = pattern.symbols.reduce((sum, symbol) => sum + symbol.beats, 0)
  const beatWidth = 420 / totalBeats
  const symbolsWithX = pattern.symbols.map((symbol, index) => {
    const previousBeats = pattern.symbols.slice(0, index).reduce((sum, item) => sum + item.beats, 0)
    return {
      symbol,
      x: 92 + previousBeats * beatWidth + (symbol.beats * beatWidth) / 2,
    }
  })

  return (
    <svg className="rhythm-staff" viewBox="0 0 560 250" role="img" aria-label={`${pattern.title}，${pattern.countText}`}>
      <rect width="560" height="250" rx="8" fill="#fffefa" />
      <g stroke="#23343d" strokeLinecap="round">
        {[0, 1, 2, 3, 4].map((line) => (
          <line key={line} x1="58" x2="502" y1={76 + line * 18} y2={76 + line * 18} strokeWidth="2" opacity="0.72" />
        ))}
        <line x1="62" x2="62" y1="76" y2="148" strokeWidth="3" />
        <line x1="498" x2="498" y1="76" y2="148" strokeWidth="3" />
      </g>
      <text x="84" y="65" className="rhythm-meter">
        4/4
      </text>
      <g className={`rhythm-symbols rhythm-${feedback}`}>
        {symbolsWithX.map(({ symbol, x }, index) => (
          <RhythmGlyph key={`${symbol.value}-${index}`} symbol={symbol} x={x} index={index} />
        ))}
      </g>
      <text x="280" y="206" textAnchor="middle" className="rhythm-count">
        {pattern.countText}
      </text>
    </svg>
  )
}

function RhythmGlyph({ symbol, x, index }: { symbol: RhythmSymbol; x: number; index: number }) {
  if (symbol.value === 'quarterRest') {
    return (
      <g className="rhythm-glyph" style={{ animationDelay: `${index * 60}ms` }}>
        <path d={`M ${x - 6} 76 C ${x + 9} 89, ${x - 12} 96, ${x + 4} 111 C ${x + 13} 120, ${x - 7} 129, ${x + 6} 144`} fill="none" stroke="#1f2d35" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
        <title>{rhythmLabelByValue[symbol.value]}</title>
      </g>
    )
  }

  if (symbol.value === 'halfRest') {
    return (
      <g className="rhythm-glyph" style={{ animationDelay: `${index * 60}ms` }}>
        <rect x={x - 19} y="93" width="38" height="12" rx="2" fill="#1f2d35" />
        <title>{rhythmLabelByValue[symbol.value]}</title>
      </g>
    )
  }

  const openHead = symbol.value === 'half' || symbol.value === 'whole'
  const hasStem = symbol.value !== 'whole'
  const hasFlag = symbol.value === 'eighth'

  return (
    <g className="rhythm-glyph" style={{ animationDelay: `${index * 60}ms` }}>
      <ellipse
        cx={x}
        cy={NOTE_Y}
        rx="17"
        ry="12"
        fill={openHead ? '#fffefa' : '#1f2d35'}
        stroke="#1f2d35"
        strokeWidth={openHead ? 5 : 3}
        transform={`rotate(-18 ${x} ${NOTE_Y})`}
      />
      {hasStem && (
        <>
          <line x1={x + 14} x2={x + 14} y1={NOTE_Y - 4} y2="56" stroke="#1f2d35" strokeWidth="5" strokeLinecap="round" />
          {hasFlag && <path d={`M ${x + 14} 56 C ${x + 46} 68, ${x + 36} 93, ${x + 22} 101`} fill="none" stroke="#1f2d35" strokeWidth="5" strokeLinecap="round" />}
        </>
      )}
      <title>{rhythmLabelByValue[symbol.value]}</title>
    </g>
  )
}
