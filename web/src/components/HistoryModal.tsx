import { History, X } from "lucide-react";
import { dayLabel, timeLabel, type BaseHistory } from "../api";

/**
 * Modal mobile-friendly com os checklists anteriores da unidade:
 * faltas e observações em destaque, sem poluir a tela principal.
 */
export function HistoryModal({
  code,
  history,
  onClose,
}: {
  code: string;
  history: BaseHistory | null;
  onClose: () => void;
}) {
  return (
    <>
      <div className="fade-in fixed inset-0 z-40 bg-slate-900/50" onClick={onClose} />
      <div className="sheet-in fixed inset-x-0 bottom-0 top-14 z-50 flex flex-col rounded-t-3xl border-t border-slate-200 bg-slate-50 shadow-2xl">
        <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-3 rounded-t-3xl">
          <History className="h-5 w-5 text-brand-600" />
          <h3 className="flex-1 text-[15px] font-bold text-slate-900">
            Checklists anteriores — {code}
            {history ? <span className="ml-1 font-normal text-slate-400">({history.windowDays} dias)</span> : null}
          </h3>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 active:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-3">
          {!history ? (
            <p className="py-10 text-center text-[14px] text-slate-400">Carregando…</p>
          ) : history.days.length === 0 ? (
            <p className="py-10 text-center text-[14px] text-slate-400">
              Nenhum checklist desta unidade nos últimos {history.windowDays} dias.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {history.days.map((d) => (
                <div key={d.day} className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-[14px] font-bold text-slate-900">
                      {dayLabel(d.day)}
                      <span className="ml-2 font-medium text-slate-500">{timeLabel(d.createdAt)}</span>
                    </p>
                    <p className="truncate text-[12px] font-medium text-slate-500">{d.doctorName}</p>
                  </div>

                  {d.missingCount === 0 && d.obs.length === 0 ? (
                    <p className="mt-1 text-[13px] text-emerald-600">Tudo conforme ✨</p>
                  ) : null}

                  {d.missing.length > 0 ? (
                    <ul className="mt-2 flex flex-col gap-1 rounded-xl bg-brand-50/60 p-2.5">
                      {d.missing.map((m) => (
                        <li key={m.key} className="text-[13px] leading-snug text-brand-800">
                          🚫 <b>{m.label}</b>
                          {m.obs ? <span className="text-brand-700/80"> — {m.obs}</span> : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {d.obs.length > 0 ? (
                    <ul className="mt-2 flex flex-col gap-1">
                      {d.obs.map((o) => (
                        <li key={o.key} className="text-[13px] leading-snug text-slate-600">
                          📝 {o.label} — <i>{o.obs}</i>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {d.values.length > 0 ? (
                    <p className="mt-2 text-[12px] text-slate-400">
                      {d.values.map((v) => `${v.label}: ${v.value}`).join(" · ")}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
