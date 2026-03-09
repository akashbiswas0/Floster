import { useState } from 'react'
import type { WorkflowNode } from '../types/workflow'
import { isTriggerType } from '../lib/nodeHelpers'

interface Props {
  node: WorkflowNode
  x: number
  y: number
  selected: boolean
  onMouseDown: (e: React.MouseEvent) => void
  onDelete: () => void
  onConnectStart: (e: React.MouseEvent, side: 'left' | 'right') => void
}

export default function CanvasNode({ node, x, y, selected, onMouseDown, onDelete, onConnectStart }: Props) {
  const [hovered, setHovered] = useState(false)
  const isTrigger = isTriggerType(node.type)
  const isErc20 = node.type === 'erc20Transfer'
  const isX402 = node.type === 'x402'
  const typeLabel = isTrigger
    ? 'TRIGGER'
    : node.type.replace(/([A-Z])/g, ' $1').trim().toUpperCase()

  const labelColorCls = isTrigger
    ? 'text-danger'
    : isErc20
    ? 'text-success'
    : isX402
    ? 'text-warning'
    : 'text-accent'

  const selectedRing = selected
    ? 'border-accent shadow-[0_0_0_1px_rgba(0,212,255,0.2),0_8px_24px_rgba(0,0,0,0.5)]'
    : 'border-border-bright shadow-[0_4px_16px_rgba(0,0,0,0.4)] hover:border-[rgba(255,255,255,0.22)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.5)]'

  const portCls =
    'absolute w-[14px] h-[14px] rounded-full bg-[#00d4ff] border-2 border-[#0a0f1a] cursor-crosshair z-20 hover:scale-125 transition-transform shadow-[0_0_6px_#00d4ff] top-1/2 -translate-y-1/2'

  return (
    <div
      data-node-id={node.id}
      onMouseDown={onMouseDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`absolute min-w-[180px] px-3 py-2.5 bg-surface border rounded-[10px] z-[2] cursor-grab select-none ${selectedRing}`}
      style={{ left: x, top: y }}
    >
      {hovered && (
        <button
          onMouseDown={(e) => { e.stopPropagation(); e.preventDefault() }}
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          className="absolute -top-2.5 -right-2.5 w-5 h-5 rounded-full bg-[#0d1117] border border-[rgba(255,255,255,0.18)] text-[rgba(255,255,255,0.55)] hover:bg-red-950 hover:text-red-400 hover:border-red-500 flex items-center justify-center text-[12px] leading-none z-20 cursor-pointer transition-colors"
          title="Delete node"
        >
          ×
        </button>
      )}

      <div className={`font-mono text-[9px] uppercase tracking-[0.1em] mb-1 ${labelColorCls}`}>
        {typeLabel}
      </div>
      <h4 className="m-0 mb-[3px] font-ui text-[13px] font-semibold text-text-primary">{node.name}</h4>
      <p className="m-0 font-mono text-[9px] text-text-muted break-all">{node.id} · {node.type}</p>

      {hovered && (
        <div
          data-port-side="left"
          onMouseDown={(e) => { e.stopPropagation(); onConnectStart(e, 'left') }}
          className={`${portCls} left-[-7px]`}
          title="Drag to connect"
        />
      )}

      {hovered && (
        <div
          data-port-side="right"
          onMouseDown={(e) => { e.stopPropagation(); onConnectStart(e, 'right') }}
          className={`${portCls} right-[-7px]`}
          title="Drag to connect"
        />
      )}
    </div>
  )
}
