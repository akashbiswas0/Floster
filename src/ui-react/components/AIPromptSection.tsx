import { useState, useRef } from 'react'
import type { WorkflowIR } from '../types/workflow'

const IconSparkle = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2l2.09 6.26L20 10l-5.91 1.74L12 18l-2.09-6.26L4 10l5.91-1.74z"/>
  </svg>
)

const IconSpinner = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
    className="animate-spin" style={{ animation: 'spin 0.8s linear infinite' }}>
    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
  </svg>
)

interface Props {
  aiPrompt: string
  onAiPromptChange: (v: string) => void
  onGenerated: (ir: WorkflowIR) => void
  simulationTarget?: string
}

export default function AIPromptSection({ aiPrompt, onAiPromptChange, onGenerated, simulationTarget }: Props) {
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamBuffer, setStreamBuffer] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  async function handleGenerate() {
    const prompt = aiPrompt.trim()
    if (!prompt) { setError('Please enter a prompt first.'); return }

    setError(null)
    setStreamBuffer('')
    setIsStreaming(true)
    setShowPreview(true)

    abortRef.current = new AbortController()

    try {
      const res = await fetch('/api/ai/generate-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, context: { targetName: simulationTarget ?? 'local-simulation' } }),
        signal: abortRef.current.signal,
      })

      if (!res.ok || !res.body) {
        const errJson = await res.json().catch(() => ({ diagnostics: [{ message: `HTTP ${res.status}` }] }))
        const msg = errJson?.diagnostics?.[0]?.message ?? `HTTP ${res.status}`
        throw new Error(msg)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) continue
          const data = trimmed.slice(5).trim()

          if (data === '[DONE]') {
            // Stream complete — parse the accumulated JSON
            const cleaned = accumulated
              .replace(/^```(?:json)?\s*/i, '')
              .replace(/\s*```\s*$/, '')
              .trim()
            try {
              const ir = JSON.parse(cleaned) as WorkflowIR
              onGenerated(ir)
            } catch {
              setError('AI returned invalid JSON. Please try again with a clearer prompt.')
            }
            return
          }

          try {
            const parsed = JSON.parse(data) as { token?: string; error?: string }
            if (parsed.error) throw new Error(parsed.error)
            if (parsed.token) {
              accumulated += parsed.token
              setStreamBuffer(accumulated)
            }
          } catch (parseErr) {
            if ((parseErr as Error).message.includes('AI returned')) throw parseErr
            // Ignore other parse errors on individual SSE chunks
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError((err as Error).message)
      }
    } finally {
      setIsStreaming(false)
    }
  }

  function handleCancel() {
    abortRef.current?.abort()
    setIsStreaming(false)
  }

  return (
    <section className="px-3 pt-2 pb-3 border-t border-[rgba(255,255,255,0.06)] mt-1">
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-purple mb-2 px-1 flex items-center gap-1">
        <IconSparkle /> AI Prompt → workflow
      </p>

      <textarea
        rows={3}
        value={aiPrompt}
        onChange={(e) => onAiPromptChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleGenerate() }}
        disabled={isStreaming}
        placeholder="Describe your workflow goal… (⌘↵ to generate)"
        className="w-full bg-bg border border-[rgba(255,255,255,0.08)] text-text-primary text-[12px] font-mono placeholder-text-muted px-2 py-2 resize-none focus:outline-none focus:border-purple focus:ring-1 focus:ring-[rgba(124,106,255,0.3)] transition-colors disabled:opacity-50"
      />

      <div className="mt-2 flex gap-2">
        <button
          onClick={handleGenerate}
          disabled={isStreaming}
          className="flex-1 font-mono text-[12px] font-medium text-black bg-white px-3 py-1.5 hover:opacity-90 transition-opacity cursor-pointer border-0 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
        >
          {isStreaming ? (
            <><IconSpinner /> Generating…</>
          ) : (
            'Generate Workflow'
          )}
        </button>

        {isStreaming && (
          <button
            onClick={handleCancel}
            className="font-mono text-[11px] text-text-muted border border-[rgba(255,255,255,0.12)] px-2 py-1.5 hover:text-text-primary hover:border-[rgba(255,255,255,0.25)] transition-colors bg-transparent cursor-pointer"
          >
            Cancel
          </button>
        )}
      </div>

      {error && (
        <p className="mt-2 text-[11px] font-mono text-red-400 break-all">{error}</p>
      )}

      {showPreview && streamBuffer && (
        <div className="mt-2">
          <button
            onClick={() => setShowPreview((v) => !v)}
            className="font-mono text-[10px] text-text-muted hover:text-text-primary transition-colors mb-1 bg-transparent border-0 cursor-pointer p-0"
          >
            {showPreview ? '▾ hide preview' : '▸ show preview'}
          </button>
          <pre className="text-[10px] font-mono text-text-muted bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] p-2 max-h-[120px] overflow-y-auto whitespace-pre-wrap break-all">
            {streamBuffer}
          </pre>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </section>
  )
}
