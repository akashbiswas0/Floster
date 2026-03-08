import { forwardRef } from 'react'
import type { Edge } from '../types/workflow'

interface NodePos { x: number; y: number }

interface Props {
  edges: Edge[]
  nodePositions: Map<string, NodePos>
}

const EdgeSVGLayer = forwardRef<SVGSVGElement, Props>(({ edges, nodePositions }, ref) => {
  const paths: React.ReactNode[] = []

  for (const edge of edges) {
    const from = nodePositions.get(edge.from)
    const to = nodePositions.get(edge.to)
    if (!from || !to) continue

    const x1 = from.x + 180
    const y1 = from.y + 26
    const x2 = to.x
    const y2 = to.y + 26

    paths.push(
      <path
        key={`path-${edge.from}-${edge.to}`}
        d={`M ${x1} ${y1} C ${x1 + 50} ${y1}, ${x2 - 50} ${y2}, ${x2} ${y2}`}
        stroke="url(#edgeGradient)"
        strokeWidth={2}
        fill="none"
      />,
      <circle key={`dot1-${edge.from}-${edge.to}`} cx={x1} cy={y1} r={4} fill="#00d4ff" style={{ filter: 'drop-shadow(0 0 4px #00d4ff)' }} />,
      <circle key={`dot2-${edge.from}-${edge.to}`} cx={x2} cy={y2} r={4} fill="#00d4ff" style={{ filter: 'drop-shadow(0 0 4px #00d4ff)' }} />,
    )
  }

  // Compute gradient span from first edge if present
  const firstEdge = edges[0]
  const gFrom = firstEdge ? nodePositions.get(firstEdge.from) : null
  const gTo = firstEdge ? nodePositions.get(firstEdge.to) : null
  const gx1 = gFrom ? gFrom.x + 180 : 0
  const gy1 = gFrom ? gFrom.y + 26 : 0
  const gx2 = gTo ? gTo.x : 100
  const gy2 = gTo ? gTo.y + 26 : 0

  return (
    <svg
      ref={ref}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    >
      <defs>
        <linearGradient id="edgeGradient" gradientUnits="userSpaceOnUse" x1={gx1} y1={gy1} x2={gx2} y2={gy2}>
          <stop offset="0%" stopColor="rgba(255,255,255,0.12)" />
          <stop offset="50%" stopColor="#00d4ff" />
          <stop offset="100%" stopColor="rgba(255,255,255,0.12)" />
        </linearGradient>
      </defs>
      {paths}
    </svg>
  )
})

EdgeSVGLayer.displayName = 'EdgeSVGLayer'
export default EdgeSVGLayer
