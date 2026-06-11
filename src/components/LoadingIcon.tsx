import { useId, useMemo } from 'react'

const ANCHORS = [
  { size: 20,  speed: 1, lineCount: 2, thicknessMax: 3,  easing: 'cubic-bezier(0.4,0,1,1)' },
  { size: 60,  speed: 2, lineCount: 4, thicknessMax: 4,  easing: 'cubic-bezier(0.7,0,1,1)' },
  { size: 120, speed: 3, lineCount: 6, thicknessMax: 8,  easing: 'cubic-bezier(0.4,0,1,1)' },
] as const

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function interpolate(size: number) {
  const clamped = Math.max(ANCHORS[0].size, Math.min(ANCHORS[ANCHORS.length - 1].size, size))

  let lo: typeof ANCHORS[number] = ANCHORS[0]
  let hi: typeof ANCHORS[number] = ANCHORS[ANCHORS.length - 1]
  for (let i = 0; i < ANCHORS.length - 1; i++) {
    if (clamped >= ANCHORS[i].size && clamped <= ANCHORS[i + 1].size) {
      lo = ANCHORS[i]
      hi = ANCHORS[i + 1]
      break
    }
  }

  const t = lo.size === hi.size ? 0 : (clamped - lo.size) / (hi.size - lo.size)

  return {
    speed:        parseFloat(lerp(lo.speed,        hi.speed,        t).toFixed(2)),
    lineCount:    Math.round(lerp(lo.lineCount,     hi.lineCount,    t)),
    thicknessMax: Math.max(1, Math.round(lerp(lo.thicknessMax, hi.thicknessMax, t))),
    easing:       t < 0.5 ? lo.easing : hi.easing,
  }
}

interface Props {
  size?: number
  className?: string
  style?: React.CSSProperties
}

export default function LoadingIcon({ size = 40, className, style }: Props) {
  const uid  = useId().replace(/:/g, '')
  const p    = useMemo(() => interpolate(size), [size])
  const name = `jf-lf-${uid}`
  const over = Math.round(p.thicknessMax * 2)

  const keyframes = `@keyframes ${name} {
    0%   { top: 50%;                          height: 1px;             opacity: 0; }
    6%   {                                                              opacity: 1; }
    88%  {                                                              opacity: 0.9; }
    100% { top: calc(100% + ${over}px);       height: ${p.thicknessMax}px; opacity: 0; }
  }`

  return (
    <>
      <style>{keyframes}</style>
      <div
        className={className}
        style={{
          width:        size,
          height:       size,
          borderRadius: '50%',
          overflow:     'hidden',
          position:     'relative',
          background:   '#1a1d23',
          flexShrink:   0,
          ...style,
        }}
      >
        {Array.from({ length: p.lineCount }, (_, i) => (
          <div
            key={i}
            style={{
              position:   'absolute',
              left: 0, right: 0,
              top:        '50%',
              height:     1,
              background: '#ffffff',
              animation:  `${name} ${p.speed}s ${p.easing} ${-(i / p.lineCount) * p.speed}s infinite`,
            }}
          />
        ))}

        <div style={{
          position:   'absolute',
          top: 0, left: 0, right: 0,
          height:     '50%',
          background: '#1a1d23',
          zIndex:     2,
        }} />

        <div style={{
          position:   'absolute',
          left: 0, right: 0,
          top:        'calc(50% - 0.5px)',
          height:     1,
          background: 'rgba(255,255,255,0.45)',
          zIndex:     3,
        }} />
      </div>
    </>
  )
}
