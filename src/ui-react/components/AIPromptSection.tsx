const IconSparkle = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2l2.09 6.26L20 10l-5.91 1.74L12 18l-2.09-6.26L4 10l5.91-1.74z"/>
  </svg>
)

interface Props {
  aiPrompt: string
  onAiPromptChange: (v: string) => void
  onGenerateAI: () => void
}

export default function AIPromptSection({ aiPrompt, onAiPromptChange, onGenerateAI }: Props) {
  return (
    <section className="px-3 pt-2 pb-3 border-t border-[rgba(255,255,255,0.06)] mt-1">
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-purple mb-2 px-1 flex items-center gap-1"><IconSparkle /> AI Prompt → IR</p>
      <textarea
        rows={3}
        value={aiPrompt}
        onChange={(e) => onAiPromptChange(e.target.value)}
        placeholder="Describe your workflow goal..."
        className="w-full bg-bg border border-[rgba(255,255,255,0.08)] text-text-primary text-[12px] font-mono placeholder-text-muted px-2 py-2 resize-none focus:outline-none focus:border-purple focus:ring-1 focus:ring-[rgba(124,106,255,0.3)] transition-colors"
      />
      <button
        onClick={onGenerateAI}
        className="mt-2 w-full font-mono text-[12px] font-medium text-panel bg-gradient-to-r from-purple to-accent px-3 py-1.5 hover:opacity-90 transition-opacity cursor-pointer border-0"
      >
        + Generate IR
      </button>
    </section>
  )
}
