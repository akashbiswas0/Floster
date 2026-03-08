import { useRef, useEffect, useCallback } from 'react'
import type { WorkflowIR, WorkflowNode, NodePosition, DraggingNodeState } from '../types/workflow'
import { allNodes, isTriggerType } from '../lib/nodeHelpers'
import CanvasNode from './CanvasNode'
import EdgeSVGLayer from './EdgeSVGLayer'

interface PendingEdgeState {
  fromId: string
  fromSide: 'left' | 'right'
  x1: number
  y1: number
  mouseX: number
  mouseY: number
}

interface Props {
  ir: WorkflowIR
  nodePositions: Map<string, NodePosition>
  selectedNodeId: string | null
  onNodePositionsChange: (positions: Map<string, NodePosition>) => void
  onSelectNode: (id: string) => void
  onDropNode: (type: string, x: number, y: number) => void
  onFieldChange: (nodeId: string, key: string, value: string | number) => void
  onAddEdge: (from: string, to: string, fromSide: 'left' | 'right', toSide: 'left' | 'right') => void
  onDeleteNode: (id: string) => void
}

export default function WorkflowCanvas({
  ir,
  nodePositions,
  selectedNodeId,
  onNodePositionsChange,
  onSelectNode,
  onDropNode,
  onFieldChange,
  onAddEdge,
  onDeleteNode,
}: Props) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const draggingRef = useRef<DraggingNodeState | null>(null)
  const pendingEdgeRef = useRef<PendingEdgeState | null>(null)
  const positionsRef = useRef<Map<string, NodePosition>>(nodePositions)

  const redrawSVG = useCallback(() => {
    const svg = svgRef.current
    if (!svg) return
    while (svg.firstChild) svg.removeChild(svg.firstChild)

    const getPortCoords = (nodeId: string, side: 'left' | 'right') => {
      const pos = positionsRef.current.get(nodeId)
      if (!pos) return null
      const nodeEl = canvasRef.current?.querySelector<HTMLElement>(`[data-node-id="${nodeId}"]`)
      const h = nodeEl ? nodeEl.offsetHeight : 52
      const w = nodeEl ? nodeEl.offsetWidth : 180
      return side === 'left'
        ? { x: pos.x, y: pos.y + h / 2 }
        : { x: pos.x + w, y: pos.y + h / 2 }
    }

    const makePath = (x1: number, y1: number, fromSide: string, x2: number, y2: number, toSide: string) => {
      const offset = Math.max(50, Math.abs(x2 - x1) * 0.45)
      const cx1 = fromSide === 'right' ? x1 + offset : x1 - offset
      const cx2 = toSide === 'right' ? x2 + offset : x2 - offset
      return `M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`
    }

    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs')
    svg.appendChild(defs)

    for (const [edgeIdx, edge] of ir.edges.entries()) {
      const fromSide = edge.fromSide ?? 'right'
      const toSide = edge.toSide ?? 'left'
      const from = getPortCoords(edge.from, fromSide)
      const to = getPortCoords(edge.to, toSide)
      if (!from || !to) continue
      const { x: x1, y: y1 } = from
      const { x: x2, y: y2 } = to

      const gradId = `edgeGradient-${edgeIdx}`
      const grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient')
      grad.setAttribute('id', gradId)
      grad.setAttribute('gradientUnits', 'userSpaceOnUse')
      grad.setAttribute('x1', String(x1))
      grad.setAttribute('y1', String(y1))
      grad.setAttribute('x2', String(x2))
      grad.setAttribute('y2', String(y2))
      const stops: [string, string][] = [['0%', 'rgba(0,212,255,0.4)'], ['50%', '#00d4ff'], ['100%', 'rgba(0,212,255,0.4)']]
      for (const [offset, color] of stops) {
        const s = document.createElementNS('http://www.w3.org/2000/svg', 'stop')
        s.setAttribute('offset', offset)
        s.setAttribute('stop-color', color)
        grad.appendChild(s)
      }
      defs.appendChild(grad)

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      path.setAttribute('d', makePath(x1, y1, fromSide, x2, y2, toSide))
      path.setAttribute('stroke', `url(#${gradId})`)
      path.setAttribute('stroke-width', '2')
      path.setAttribute('fill', 'none')
      path.setAttribute('style', 'filter:drop-shadow(0 0 4px #001eff)')
      svg.appendChild(path)

      for (const [cx, cy] of [[x1, y1], [x2, y2]] as [number, number][]) {
        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
        dot.setAttribute('cx', String(cx))
        dot.setAttribute('cy', String(cy))
        dot.setAttribute('r', '4')
        dot.setAttribute('fill', '#00d4ff')
        dot.setAttribute('style', 'filter:drop-shadow(0 0 4px #00d4ff)')
        svg.appendChild(dot)
      }
    }

    const pe = pendingEdgeRef.current
    if (pe) {
      const dx = pe.mouseX - pe.x1
      const offset = Math.max(40, Math.abs(dx) * 0.45)
      const cx1 = pe.fromSide === 'right' ? pe.x1 + offset : pe.x1 - offset
      const pendingPath = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      pendingPath.setAttribute(
        'd',
        `M ${pe.x1} ${pe.y1} C ${cx1} ${pe.y1}, ${pe.mouseX - offset * Math.sign(dx || 1)} ${pe.mouseY}, ${pe.mouseX} ${pe.mouseY}`
      )
      pendingPath.setAttribute('stroke', 'rgba(0,212,255,0.7)')
      pendingPath.setAttribute('stroke-width', '2')
      pendingPath.setAttribute('stroke-dasharray', '6 3')
      pendingPath.setAttribute('fill', 'none')
      svg.appendChild(pendingPath)

      const endDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
      endDot.setAttribute('cx', String(pe.mouseX))
      endDot.setAttribute('cy', String(pe.mouseY))
      endDot.setAttribute('r', '5')
      endDot.setAttribute('fill', '#00d4ff')
      endDot.setAttribute('style', 'filter:drop-shadow(0 0 6px #00d4ff)')
      svg.appendChild(endDot)
    }
  }, [ir.edges])

  useEffect(() => {
    positionsRef.current = nodePositions
    redrawSVG()
  }, [nodePositions, redrawSVG])

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const pe = pendingEdgeRef.current
      if (pe) {
        const rect = canvasRef.current!.getBoundingClientRect()
        pe.mouseX = e.clientX - rect.left + canvasRef.current!.scrollLeft
        pe.mouseY = e.clientY - rect.top + canvasRef.current!.scrollTop
        redrawSVG()
        return
      }

      const drag = draggingRef.current
      if (!drag) return
      const dx = e.clientX - drag.startClientX
      const dy = e.clientY - drag.startClientY
      if (!drag.moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) drag.moved = true
      if (!drag.moved) return
      const newX = Math.max(0, drag.origX + dx)
      const newY = Math.max(0, drag.origY + dy)
      positionsRef.current.set(drag.id, { x: newX, y: newY })
      const nodeDiv = canvasRef.current?.querySelector<HTMLElement>(`[data-node-id="${drag.id}"]`)
      if (nodeDiv) {
        nodeDiv.style.left = `${newX}px`
        nodeDiv.style.top = `${newY}px`
        nodeDiv.style.opacity = '0.75'
        nodeDiv.style.cursor = 'grabbing'
      }
      redrawSVG()
    }

    const onMouseUp = (e: MouseEvent) => {
      const pe = pendingEdgeRef.current
      if (pe) {
        pendingEdgeRef.current = null
        const portEl = (e.target as HTMLElement).closest<HTMLElement>('[data-port-side]')
        const nodeEl = (e.target as HTMLElement).closest<HTMLElement>('[data-node-id]')
        const targetId = nodeEl?.dataset.nodeId
        if (targetId && targetId !== pe.fromId) {
          let toSide: 'left' | 'right'
          if (portEl?.dataset.portSide === 'left' || portEl?.dataset.portSide === 'right') {
            toSide = portEl.dataset.portSide as 'left' | 'right'
          } else {
            const targetDiv = canvasRef.current?.querySelector<HTMLElement>(`[data-node-id="${targetId}"]`)
            const targetPos = positionsRef.current.get(targetId)
            toSide = (targetDiv && targetPos)
              ? (pe.mouseX < targetPos.x + targetDiv.offsetWidth / 2 ? 'left' : 'right')
              : 'left'
          }
          onAddEdge(pe.fromId, targetId, pe.fromSide, toSide)
        }
        redrawSVG()
        return
      }

      const drag = draggingRef.current
      if (!drag) return
      draggingRef.current = null
      const nodeDiv = canvasRef.current?.querySelector<HTMLElement>(`[data-node-id="${drag.id}"]`)
      if (nodeDiv) {
        nodeDiv.style.opacity = ''
        nodeDiv.style.cursor = ''
      }
      if (!drag.moved) {
        onSelectNode(drag.id)
      } else {
        onNodePositionsChange(new Map(positionsRef.current))
      }
      if (nodeDiv) nodeDiv.style.transition = ''
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [onSelectNode, onNodePositionsChange, onAddEdge, redrawSVG])

  function handleNodeMouseDown(e: React.MouseEvent, nodeId: string) {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).tagName === 'INPUT' ||
        (e.target as HTMLElement).tagName === 'SELECT' ||
        (e.target as HTMLElement).tagName === 'BUTTON') return
    e.preventDefault()
    const pos = positionsRef.current.get(nodeId) || { x: 0, y: 0 }
    const nodeDiv = canvasRef.current?.querySelector<HTMLElement>(`[data-node-id="${nodeId}"]`)
    if (nodeDiv) nodeDiv.style.transition = 'none'
    draggingRef.current = {
      id: nodeId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origX: pos.x,
      origY: pos.y,
      moved: false,
    }
  }

  function handleConnectStart(e: React.MouseEvent, nodeId: string, side: 'left' | 'right') {
    if (e.button !== 0) return
    e.preventDefault()
    const pos = positionsRef.current.get(nodeId) || { x: 0, y: 0 }
    const nodeEl = canvasRef.current?.querySelector<HTMLElement>(`[data-node-id="${nodeId}"]`)
    const h = nodeEl ? nodeEl.offsetHeight : 52
    const w = nodeEl ? nodeEl.offsetWidth : 180
    const x1 = side === 'left' ? pos.x : pos.x + w
    const y1 = pos.y + h / 2
    const rect = canvasRef.current!.getBoundingClientRect()
    pendingEdgeRef.current = {
      fromId: nodeId,
      fromSide: side,
      x1,
      y1,
      mouseX: e.clientX - rect.left + canvasRef.current!.scrollLeft,
      mouseY: e.clientY - rect.top + canvasRef.current!.scrollTop,
    }
    redrawSVG()
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault()
    canvasRef.current?.classList.add('drag-over')
  }

  function handleDragLeave(e: React.DragEvent) {
    if (!canvasRef.current?.contains(e.relatedTarget as Node)) {
      canvasRef.current?.classList.remove('drag-over')
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    canvasRef.current?.classList.remove('drag-over')
    const type = e.dataTransfer.getData('text/plain')
    if (!type) return
    const rect = canvasRef.current!.getBoundingClientRect()
    const x = Math.max(0, e.clientX - rect.left + canvasRef.current!.scrollLeft - 90)
    const y = Math.max(0, e.clientY - rect.top + canvasRef.current!.scrollTop - 26)
    onDropNode(type, x, y)
  }

  const nodes = allNodes(ir)
  const selectedNode = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) ?? null : null

  function getPos(node: WorkflowNode, ti: number, ai: number): NodePosition {
    if (nodePositions.has(node.id)) return nodePositions.get(node.id)!
    const isTrigger = isTriggerType(node.type)
    return isTrigger
      ? { x: 40, y: 40 + ti * 100 }
      : { x: 280 + (ai % 3) * 220, y: 40 + Math.floor(ai / 3) * 110 }
  }

  const renderedNodes: React.ReactNode[] = []
  let ti = 0, ai = 0
  for (const node of nodes) {
    const pos = getPos(node, ti, ai)
    if (isTriggerType(node.type)) ti++ ; else ai++
    renderedNodes.push(
      <CanvasNode
        key={node.id}
        node={node}
        x={pos.x}
        y={pos.y}
        selected={node.id === selectedNodeId}
        onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
        onDelete={() => onDeleteNode(node.id)}
        onConnectStart={(e, side) => handleConnectStart(e, node.id, side)}
      />
    )
  }

  return (
    <div
      ref={canvasRef}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="flex-1 relative overflow-auto canvas-grid"
      style={{
        backgroundColor: '#000000',
        backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.15) 1px, transparent 1px)',
        backgroundSize: '20px 20px',
      }}
    >
      <div className="pointer-events-none absolute top-[-60px] left-[-60px] w-[260px] h-[260px] rounded-full bg-accent opacity-[0.06] blur-[100px]" />
      <div className="pointer-events-none absolute top-[30%] right-[-40px] w-[320px] h-[320px] rounded-full bg-purple opacity-[0.07] blur-[100px]" />

      <span className="absolute top-4 left-5 font-ui font-bold text-[18px] text-text-primary pointer-events-none z-10">
        Workflow Canvas
      </span>

      {nodes.length === 0 && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-3 pointer-events-none select-none z-[1]">
          <div className="text-[52px] opacity-[0.12] leading-none">⊕</div>
          <p className="font-mono text-[11px] text-text-muted text-center leading-[1.7] m-0">
            Drag nodes from the palette<br />to get started
          </p>
        </div>
      )}

      {renderedNodes}

      <EdgeSVGLayer ref={svgRef} />

    </div>
  )
}
