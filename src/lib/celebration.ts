import confetti from 'canvas-confetti'

export function launchCompletionConfetti(simple: boolean): void {
  const duration = simple ? 900 : 2200
  const endAt = Date.now() + duration
  const colors = ['#18a999', '#f6b23b', '#5a8dee', '#ef766f', '#8f7ae5', '#ffffff']

  const launch = () => {
    confetti({
      particleCount: simple ? 18 : 34,
      angle: 60,
      spread: 66,
      startVelocity: simple ? 34 : 48,
      origin: { x: 0, y: 0.72 },
      colors,
      zIndex: 100,
      disableForReducedMotion: true,
    })
    confetti({
      particleCount: simple ? 18 : 34,
      angle: 120,
      spread: 66,
      startVelocity: simple ? 34 : 48,
      origin: { x: 1, y: 0.72 },
      colors,
      zIndex: 100,
      disableForReducedMotion: true,
    })

    if (Date.now() < endAt) {
      window.setTimeout(launch, simple ? 360 : 260)
    }
  }

  launch()
}
