interface Props {
  selectionText: string
}

export default function Topbar({ selectionText }: Props) {
  return (
    <header className="h-12 flex-shrink-0 bg-panel border-b border-[rgba(255,255,255,0.06)] flex items-center justify-between px-5">
      <div className="flex items-center gap-3">
        <span className="font-ui font-bold text-[14px] text-text-primary tracking-wide">CRE Builder</span>
      </div>
      <p className="font-mono text-[10px] text-text-secondary bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] px-2 py-0.5">
        {selectionText}
      </p>
    </header>
  )
}
