let sharedAudioContext: AudioContext | undefined

export function playFeedbackTone(kind: 'correct' | 'wrong' | 'complete'): void {
  const context = getAudioContext()
  if (!context) {
    return
  }

  if (kind === 'wrong') {
    playTryAgainTone(context)
    return
  }

  const oscillator = context.createOscillator()
  const gain = context.createGain()

  const frequency = kind === 'correct' ? 660 : 880
  oscillator.frequency.setValueAtTime(frequency, context.currentTime)
  oscillator.type = 'sine'
  gain.gain.setValueAtTime(0.0001, context.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.22)

  oscillator.connect(gain)
  gain.connect(context.destination)
  oscillator.start()
  oscillator.stop(context.currentTime + 0.24)
}

function playTryAgainTone(context: AudioContext): void {
  const now = context.currentTime
  const gain = context.createGain()
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.045, now + 0.025)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.48)
  gain.connect(context.destination)

  for (const [index, frequency] of [392, 523.25].entries()) {
    const oscillator = context.createOscillator()
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(frequency, now)
    oscillator.connect(gain)
    oscillator.start(now + index * 0.09)
    oscillator.stop(now + 0.5)
  }
}

export function playPianoNote(noteId: string): void {
  const context = getAudioContext()
  const frequency = getNoteFrequency(noteId)
  if (!context || !frequency) {
    return
  }

  const now = context.currentTime
  const masterGain = context.createGain()
  const filter = context.createBiquadFilter()
  masterGain.gain.setValueAtTime(0.0001, now)
  masterGain.gain.exponentialRampToValueAtTime(0.24, now + 0.008)
  masterGain.gain.exponentialRampToValueAtTime(0.055, now + 0.34)
  masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.25)
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(Math.min(5400, frequency * 10), now)
  filter.frequency.exponentialRampToValueAtTime(Math.max(1200, frequency * 4), now + 1.1)
  masterGain.connect(filter)
  filter.connect(context.destination)

  const harmonics = [
    { multiple: 1, gain: 1 },
    { multiple: 2, gain: 0.38 },
    { multiple: 3, gain: 0.16 },
    { multiple: 4, gain: 0.07 },
  ]

  for (const harmonic of harmonics) {
    const oscillator = context.createOscillator()
    const harmonicGain = context.createGain()
    oscillator.type = harmonic.multiple === 1 ? 'triangle' : 'sine'
    oscillator.frequency.setValueAtTime(frequency * harmonic.multiple, now)
    oscillator.detune.setValueAtTime(harmonic.multiple % 2 === 0 ? 2 : -2, now)
    harmonicGain.gain.setValueAtTime(harmonic.gain, now)
    harmonicGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2 / Math.sqrt(harmonic.multiple))
    oscillator.connect(harmonicGain)
    harmonicGain.connect(masterGain)
    oscillator.start(now)
    oscillator.stop(now + 1.3)
  }
}

function getAudioContext(): AudioContext | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }

  const AudioContextClass = window.AudioContext || window.webkitAudioContext
  if (!AudioContextClass) {
    return undefined
  }

  sharedAudioContext ??= new AudioContextClass()
  if (sharedAudioContext.state === 'suspended') {
    void sharedAudioContext.resume()
  }
  return sharedAudioContext
}

function getNoteFrequency(noteId: string): number | undefined {
  const match = /^([A-G])(#?)(\d)$/.exec(noteId)
  if (!match) {
    return undefined
  }

  const [, noteName, accidental, octaveText] = match
  const semitoneByNote: Record<string, number> = {
    C: 0,
    D: 2,
    E: 4,
    F: 5,
    G: 7,
    A: 9,
    B: 11,
  }
  const midi = (Number(octaveText) + 1) * 12 + semitoneByNote[noteName] + (accidental ? 1 : 0)
  return 440 * 2 ** ((midi - 69) / 12)
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext
  }
}
