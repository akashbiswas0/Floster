interface Props {
  selectionText: string
  modeLabel: string
  modeDotColor: string
}

export default function Topbar({ selectionText, modeLabel, modeDotColor }: Props) {
  return (
    <header className="h-12 flex-shrink-0 bg-panel border-b border-[rgba(255,255,255,0.06)] flex items-center justify-between px-5">
      <div className="flex items-center gap-3">
        <span className="font-ui font-bold text-[14px] text-text-primary tracking-wide">CRE Builder</span>
        <span className="flex items-center gap-1.5 px-2 py-0.5 border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] font-mono text-[9px] uppercase tracking-widest text-text-secondary">
          <span
            className="w-1.5 h-1.5 rounded-full animate-[pulse-opacity_2s_ease-in-out_infinite]"
            style={{ backgroundColor: modeDotColor }}
          />
          {modeLabel}
        </span>
      </div>
      <p className="font-mono text-[10px] text-text-secondary bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] px-2 py-0.5">
        {selectionText}
      </p>
    </header>
  )
}
