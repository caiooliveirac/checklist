import samuLogo from "../assets/Samu192.png";

export function AppHeader({ subtitle }: { subtitle?: string }) {
  return (
    <header className="flex items-center gap-3">
      <img
        src={samuLogo}
        alt="SAMU 192"
        className="h-11 w-11 rounded-xl border border-brand-100 bg-white object-contain p-1 shadow-sm"
      />
      <div className="min-w-0">
        <h1 className="truncate text-xl font-bold tracking-tight text-brand-700">Checklist USA</h1>
        {subtitle ? <p className="truncate text-[13px] text-slate-500">{subtitle}</p> : null}
      </div>
    </header>
  );
}
