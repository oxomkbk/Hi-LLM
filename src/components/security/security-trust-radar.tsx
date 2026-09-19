import type { PublicSecurityAssessment } from '@/types'

type SecurityDimension = NonNullable<PublicSecurityAssessment['security_dimensions']>[number]

const DIMENSION_ORDER: SecurityDimension['code'][] = [
  'safety',
  'reliability',
  'effectiveness',
  'maintainability',
  'applicability',
]

export default function SecurityTrustRadar({ dimensions }: { dimensions: SecurityDimension[] }) {
  const ordered = DIMENSION_ORDER
    .map(code => dimensions.find(dimension => dimension.code === code))
    .filter((dimension): dimension is SecurityDimension => Boolean(dimension))

  if (ordered.length !== DIMENSION_ORDER.length)
    return null

  const centerX = 120
  const centerY = 102
  const radius = 62
  const point = (index: number, scale: number, distance = radius) => {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / DIMENSION_ORDER.length
    return {
      x: centerX + Math.cos(angle) * distance * scale,
      y: centerY + Math.sin(angle) * distance * scale,
    }
  }
  const polygon = (scale: number) => ordered.map((_, index) => {
    const value = point(index, scale)
    return `${value.x},${value.y}`
  }).join(' ')
  const scorePolygon = ordered.map((dimension, index) => {
    const value = point(index, Math.max(0, Math.min(5, dimension.score)) / 5)
    return `${value.x},${value.y}`
  }).join(' ')

  return (
    <figure
      aria-label={ordered.map(dimension => `${dimensionLabel(dimension.code)} ${dimension.score.toFixed(1)} 分`).join('，')}
      className="public-trust-radar"
    >
      <svg role="img" viewBox="0 0 240 210">
        {[1, 0.75, 0.5, 0.25].map(scale => <polygon key={scale} points={polygon(scale)} className="public-radar-grid" />)}
        {ordered.map((dimension, index) => {
          const outer = point(index, 1)
          return <line key={dimension.code} x1={centerX} x2={outer.x} y1={centerY} y2={outer.y} />
        })}
        <polygon points={scorePolygon} className="public-radar-score" />
        {ordered.map((dimension, index) => {
          const score = point(index, Math.max(0, Math.min(5, dimension.score)) / 5)
          return <circle key={dimension.code} cx={score.x} cy={score.y} r="2.5" />
        })}
        {ordered.map((dimension, index) => {
          const label = point(index, 1, 80)
          return (
            <text key={`label-${dimension.code}`} textAnchor={textAnchor(label.x, centerX)} x={label.x} y={label.y}>
              <tspan x={label.x}>
                {dimensionLetter(dimension.code)}
                {' '}
                ·
                {' '}
                {dimensionLabel(dimension.code)}
              </tspan>
              <tspan dy="12" x={label.x} className="public-radar-value">{dimension.score.toFixed(1)}</tspan>
            </text>
          )
        })}
      </svg>
    </figure>
  )
}

function dimensionLabel(code: SecurityDimension['code']) {
  return ({ applicability: '适配', effectiveness: '效果', maintainability: '规范', reliability: '可靠', safety: '安全' } as const)[code]
}

function dimensionLetter(code: SecurityDimension['code']) {
  return ({ applicability: 'A', effectiveness: 'E', maintainability: 'C', reliability: 'R', safety: 'S' } as const)[code]
}

function textAnchor(x: number, center: number) {
  if (Math.abs(x - center) < 8)
    return 'middle'
  return x < center ? 'end' : 'start'
}
