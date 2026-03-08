import { forwardRef } from 'react'

const EdgeSVGLayer = forwardRef<SVGSVGElement, object>((_props, ref) => (
  <svg
    ref={ref}
    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
  />
))

EdgeSVGLayer.displayName = 'EdgeSVGLayer'
export default EdgeSVGLayer
