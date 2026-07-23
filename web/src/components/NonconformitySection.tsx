import { useState } from "react";
import { Camera, X } from "lucide-react";
import { dayLabel, timeLabel, type Nonconformity } from "../api";

/**
 * Inconformidades já registradas na unidade (janela de 7 dias): miniaturas com
 * descrição; toque abre a foto ampliada. Visível a quem abre a unidade.
 */
export function NonconformitySection({ items }: { items: Nonconformity[] }) {
  const [open, setOpen] = useState<Nonconformity | null>(null);

  if (items.length === 0) return null;

  return (
    <div className="mt-4 rounded-2xl border border-brand-200 bg-white p-4 shadow-sm">
      <p className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wide text-brand-600">
        <Camera className="h-4 w-4" />
        Inconformidades registradas ({items.length})
      </p>
      <ul className="mt-3 flex flex-col gap-3">
        {items.map((nc) => (
          <li key={nc.id} className="flex gap-3">
            <button
              onClick={() => setOpen(nc)}
              className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100"
            >
              <img src={nc.photoUrl} alt="Inconformidade" loading="lazy" className="h-full w-full object-cover" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] leading-snug text-slate-800">{nc.description}</p>
              <p className="mt-0.5 text-[12px] text-slate-400">
                {dayLabel(nc.day)} {timeLabel(nc.createdAt)}
                {nc.doctorName ? ` · ${nc.doctorName}` : ""}
              </p>
            </div>
          </li>
        ))}
      </ul>

      {open ? (
        <div
          className="fade-in fixed inset-0 z-50 flex flex-col bg-slate-900/90 p-4"
          onClick={() => setOpen(null)}
        >
          <div className="flex justify-end">
            <button
              aria-label="Fechar"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
          <div className="flex flex-1 items-center justify-center">
            <img src={open.photoUrl} alt="Inconformidade" className="max-h-full max-w-full rounded-xl object-contain" />
          </div>
          <div className="pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-3 text-center">
            <p className="text-[14px] text-white">{open.description}</p>
            <p className="mt-0.5 text-[12px] text-white/60">
              {dayLabel(open.day)} {timeLabel(open.createdAt)}
              {open.doctorName ? ` · ${open.doctorName}` : ""}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
