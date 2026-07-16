import { useEffect, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import type { ChecklistItemDef } from "../api";

export interface ObsResult {
  state: "ok" | "missing";
  obs: string;
}

/**
 * Bottom sheet para observações: marca o item como FALTANDO (com obs) ou
 * mantém OK com uma observação registrada.
 */
export function ObsSheet({
  item,
  initialObs,
  onClose,
  onConfirm,
}: {
  item: ChecklistItemDef | null;
  initialObs: string;
  onClose: () => void;
  onConfirm: (result: ObsResult) => void;
}) {
  const [obs, setObs] = useState(initialObs);

  useEffect(() => setObs(initialObs), [item?.key, initialObs]);

  if (!item) return null;

  return (
    <>
      <div className="fade-in fixed inset-0 z-40 bg-slate-900/40" onClick={onClose} />
      <div className="sheet-in fixed inset-x-0 bottom-0 z-50 rounded-t-3xl border-t border-slate-200 bg-white p-4 pb-[max(env(safe-area-inset-bottom),1rem)] shadow-2xl">
        <div className="mx-auto w-full max-w-md">
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-200" />
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Item</p>
          <h3 className="mt-0.5 text-[15px] font-semibold leading-snug text-slate-900">{item.label}</h3>

          <textarea
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            rows={3}
            maxLength={300}
            placeholder="Observação (ex.: lâmina 3 no almoxarifado, bateria 90%…)"
            className="mt-3 w-full resize-none rounded-xl border border-slate-300 bg-slate-50 p-3 text-[15px] outline-none ring-brand-300 focus:bg-white focus:ring-2"
          />

          <div className="mt-3 grid grid-cols-1 gap-2">
            <button
              onClick={() => onConfirm({ state: "missing", obs: obs.trim() })}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 text-[15px] font-semibold text-white shadow-sm active:bg-brand-700"
            >
              <XCircle className="h-5 w-5" />
              Marcar como FALTANDO
            </button>
            <button
              onClick={() => onConfirm({ state: "ok", obs: obs.trim() })}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 text-[15px] font-semibold text-emerald-800 active:bg-emerald-100"
            >
              <CheckCircle2 className="h-5 w-5" />
              Item OK, só registrar observação
            </button>
            <button onClick={onClose} className="min-h-10 rounded-xl px-4 text-[14px] font-medium text-slate-500">
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
