import { useState, useRef, useCallback, useEffect } from 'react'

interface Props {
  irJson: string
  output: string
  isSimulating: boolean
  onIRJsonChange: (v: string) => void
}

export default function BottomPanels({ irJson, output, isSimulating, onIRJsonChange }: Props) {
  const [height, setHeight] = useState(220)
  const [irWidth, setIrWidth] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const irPanelRef = useRef<HTMLDivElement>(null)

  // Horizontal resize (panel height)
  const handleHMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startY = e.clientY
    const startH = height
    const onMove = (ev: MouseEvent) => {
      setHeight(Math.max(80, Math.min(640, startH + (startY - ev.clientY))))
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [height])

  // Vertical resize (column split)
  const handleVMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = irPanelRef.current?.offsetWidth ?? (containerRef.current?.offsetWidth ?? 800) / 2
    const onMove = (ev: MouseEvent) => {
      const parentW = containerRef.current?.offsetWidth ?? 800
      setIrWidth(Math.max(150, Math.min(parentW - 170, startW + (ev.clientX - startX))))
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [])

  const resizeHCls =
    'h-[5px] flex-shrink-0 cursor-ns-resize bg-[rgba(255,255,255,0.03)] border-t border-b border-[rgba(255,255,255,0.07)] hover:bg-[rgba(0,212,255,0.08)] hover:border-[rgba(0,212,255,0.3)] transition-colors relative flex items-center justify-center'
  const resizeVCls =
    'w-[5px] flex-shrink-0 cursor-ew-resize bg-[rgba(255,255,255,0.03)] border-l border-r border-[rgba(255,255,255,0.07)] hover:bg-[rgba(0,212,255,0.08)] hover:border-[rgba(0,212,255,0.3)] transition-colors'

  const panelHeaderCls = 'flex items-center justify-between px-4 py-2 border-b border-[rgba(255,255,255,0.06)]'
  const copyBtnCls =
    'font-mono text-[9px] text-text-muted hover:text-text-secondary border border-[rgba(255,255,255,0.06)] px-2 py-0.5 bg-transparent cursor-pointer transition-colors'

  return (
    <>
      {/* Horizontal resize handle */}
      <div onMouseDown={handleHMouseDown} className={resizeHCls}>
        <div className="w-8 h-0.5 bg-[rgba(255,255,255,0.1)] rounded" />
      </div>

      {/* Bottom panels row */}
      <div
        ref={containerRef}
        className="flex-shrink-0 flex"
        style={{ height }}
      >
        {/* IR JSON panel */}
        <div
          ref={irPanelRef}
          className="flex flex-col bg-panel overflow-hidden"
          style={irWidth !== null ? { width: irWidth, flex: 'none' } : { width: '50%', minWidth: 150 }}
        >
          <div className={panelHeaderCls}>
            <div className="flex items-center gap-2">
              <span className="font-ui text-[12px] font-semibold text-text-primary">Workflow IR JSON</span>
              <span className="font-mono text-[8px] uppercase tracking-widest text-purple border border-[rgba(124,106,255,0.3)] bg-[rgba(124,106,255,0.08)] px-1.5 py-0.5">
                IR v1.0
              </span>
            </div>
            <button
              onClick={() => navigator.clipboard.writeText(irJson)}
              className={copyBtnCls}
            >
              + copy
            </button>
          </div>
          <textarea
            id="ir-json"
            spellCheck={false}
            value={irJson}
            onChange={(e) => onIRJsonChange(e.target.value)}
            className="flex-1 w-full bg-bg text-text-secondary font-mono text-[10px] leading-relaxed px-4 py-3 border-0 resize-none focus:outline-none overflow-auto"
          />
        </div>

        {/* Vertical resize handle */}
        <div onMouseDown={handleVMouseDown} className={resizeVCls} />

        {/* Output panel */}
        <div className="flex-1 flex flex-col bg-panel overflow-hidden" style={{ minWidth: 150 }}>
          <div className={panelHeaderCls}>
            <div className="flex items-center gap-2">
              <span className="font-ui text-[12px] font-semibold text-text-primary">Output</span>
              <span className="font-mono text-[8px] uppercase tracking-widest text-success border border-[rgba(0,229,160,0.3)] bg-[rgba(0,229,160,0.08)] px-1.5 py-0.5">
                SIMULATION
              </span>
            </div>
            <button
              onClick={() => navigator.clipboard.writeText(output)}
              className={copyBtnCls}
            >
              + copy
            </button>
          </div>
          {isSimulating ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3">
              <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"
                  strokeLinecap="round" style={{ color: 'var(--color-success, #00e5a0)' }} />
              </svg>
              <span className="font-mono text-[10px] text-text-muted uppercase tracking-widest">Simulating…</span>
            </div>
          ) : (
            <pre
              id="output"
              className="flex-1 font-mono text-[10px] text-text-secondary leading-relaxed px-4 py-3 overflow-auto m-0 whitespace-pre-wrap break-all"
            >
              {output}
            </pre>
          )}
        </div>
      </div>
    </>
  )
}
