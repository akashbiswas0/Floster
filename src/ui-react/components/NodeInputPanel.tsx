import type { WorkflowNode } from '../types/workflow'
import { editableFieldsForNode } from '../lib/nodeHelpers'

interface Props {
  selectedNode: WorkflowNode | null
  onFieldChange: (key: string, value: string | number) => void
}

export default function NodeInputPanel({ selectedNode, onFieldChange }: Props) {
  if (!selectedNode) {
    return (
      <div className="flex-shrink-0 bg-panel border-t border-[rgba(255,255,255,0.08)] border-l-[3px] border-l-accent px-[14px] py-[10px]">
        <h3 className="m-0 mb-[10px] font-ui text-[13px] font-semibold text-text-primary">Node Inputs</h3>
        <small className="block mt-2 font-mono text-[9px] text-accent bg-[rgba(0,212,255,0.06)] border border-[rgba(0,212,255,0.15)] px-2 py-1">
          Select a node on canvas to edit its required inputs.
        </small>
      </div>
    )
  }

  const fields = editableFieldsForNode(selectedNode)

  if (fields.length === 0) {
    return (
      <div className="flex-shrink-0 bg-panel border-t border-[rgba(255,255,255,0.08)] border-l-[3px] border-l-accent px-[14px] py-[10px]">
        <h3 className="m-0 mb-[10px] font-ui text-[13px] font-semibold text-text-primary">Node Inputs</h3>
        <small className="block mt-2 font-mono text-[9px] text-accent bg-[rgba(0,212,255,0.06)] border border-[rgba(0,212,255,0.15)] px-2 py-1">
          No editable input fields for {selectedNode.id} ({selectedNode.type}).
        </small>
      </div>
    )
  }

  const inputCls =
    'bg-bg border border-[rgba(255,255,255,0.08)] text-text-primary font-mono text-[11px] px-2 py-1 outline-none transition-colors focus:border-accent focus:shadow-[0_0_0_1px_rgba(0,212,255,0.15)]'

  return (
    <div className="flex-shrink-0 bg-panel border-t border-[rgba(255,255,255,0.08)] border-l-[3px] border-l-accent px-[14px] py-[10px]">
      <h3 className="m-0 mb-[10px] font-ui text-[13px] font-semibold text-text-primary">
        Node Inputs: {selectedNode.name}
      </h3>
      <div className="grid grid-cols-3 gap-2">
        {fields.map((field) => {
          const value = selectedNode[field.key]
          return (
            <label
              key={field.key}
              className="flex flex-col gap-[3px] font-mono text-[9px] uppercase tracking-[0.08em] text-text-muted"
            >
              {field.label}
              {field.input === 'select' ? (
                <select
                  value={String(value ?? '')}
                  onChange={(e) => onFieldChange(field.key, e.target.value)}
                  className={inputCls}
                >
                  {field.options?.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              ) : (
                <input
                  type={field.input === 'number' ? 'number' : 'text'}
                  value={String(value ?? '')}
                  onChange={(e) => {
                    if (field.input === 'number') {
                      const n = Number.parseInt(e.target.value, 10)
                      if (!Number.isNaN(n)) onFieldChange(field.key, n)
                    } else {
                      onFieldChange(field.key, e.target.value)
                    }
                  }}
                  className={inputCls}
                />
              )}
            </label>
          )
        })}
      </div>
      {selectedNode.type === 'erc20Transfer' && (
        <small className="block mt-2 font-mono text-[9px] text-accent bg-[rgba(0,212,255,0.06)] border border-[rgba(0,212,255,0.15)] px-2 py-1">
          Receiver contract is derived from the selected simulation mode and hidden from normal editing.
        </small>
      )}
    </div>
  )
}
