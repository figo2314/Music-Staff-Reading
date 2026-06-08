export function playFeedbackTone(kind: 'correct' | 'wrong' | 'complete'): void {
  if (typeof window === 'undefined') {
    return
  }

  const AudioContextClass = window.AudioContext || window.webkitAudioContext
  if (!AudioContextClass) {
    return
  }

  const context = new AudioContextClass()
  const oscillator = context.createOscillator()
  const gain = context.createGain()

  const frequency = kind === 'correct' ? 660 : kind === 'complete' ? 880 : 220
  oscillator.frequency.setValueAtTime(frequency, context.currentTime)
  oscillator.type = kind === 'wrong' ? 'triangle' : 'sine'
  gain.gain.setValueAtTime(0.0001, context.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.22)

  oscillator.connect(gain)
  gain.connect(context.destination)
  oscillator.start()
  oscillator.stop(context.currentTime + 0.24)
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext
  }
}
