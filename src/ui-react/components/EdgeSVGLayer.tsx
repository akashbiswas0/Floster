import { forwardRef } from 'react'

// This SVG is owned entirely by WorkflowCanvas.redrawSVG (imperative).
// Do NOT render React children here — that would conflict with direct DOM manipulation.
const EdgeSVGLayer = forwardRef<SVGSVGElement, object>((_props, ref) => (
  <svg
    ref={ref}
    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
  />
))

EdgeSVGLayer.displayName = 'EdgeSVGLayer'
export default EdgeSVGLayer
