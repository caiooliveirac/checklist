import { Check, MessageSquarePlus, TriangleAlert } from "lucide-react";
import clsx from "clsx";
import type { AnsweredItem, ChecklistItemDef } from "../api";

/**
 * Linha de item do checklist, otimizada para o polegar:
 * - toque na linha alterna ✅ conforme;
 * - botão lateral abre a folha de observação/falta;
 * - itens de campo (lacre/data) usam input nativo e valem como ✅ ao preencher.
 */
export function ItemRow({
  item,
  answer,
  onToggleOk,
  onOpenSheet,
  onFieldChange,
}: {
  item: ChecklistItemDef;
  answer: AnsweredItem | undefined;
  onToggleOk: () => void;
  onOpenSheet: () => void;
  onFieldChange: (value: string) => void;
}) {
  const state = answer?.state;
  const isField = item.kind !== "check";

  if (isField) {
    return (
      <div
        className={clsx(
          "flex flex-col gap-2 rounded-2xl border bg-white p-3.5 shadow-sm transition-colors",
          state === "ok" ? "border-emerald-200" : state === "missing" ? "border-brand-300 bg-brand-50/40" : "border-slate-200",
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-[15px] font-medium leading-snug text-slate-800">{item.label}</p>
          {state === "missing" ? <TriangleAlert className="h-5 w-5 shrink-0 text-brand-600" /> : null}
        </div>
        <input
          type={item.kind === "date" ? "date" : "text"}
          inputMode={item.kind === "date" ? undefined : "numeric"}
          placeholder={item.hint ?? "Preencher"}
          value={answer?.value ?? ""}
          onChange={(e) => onFieldChange(e.target.value)}
          className="min-h-11 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 text-[15px] outline-none ring-brand-300 focus:bg-white focus:ring-2"
        />
        {answer?.obs ? <p className="text-[13px] italic text-slate-500">Obs: {answer.obs}</p> : null}
        <button
          onClick={onOpenSheet}
          className="self-start text-[13px] font-semibold text-slate-500 underline-offset-2 active:underline"
        >
          {state === "missing" ? "Editar falta/observação" : "Relatar falta ou observação"}
        </button>
      </div>
    );
  }

  return (
    <div
      className={clsx(
        "flex items-stretch gap-2 rounded-2xl border bg-white shadow-sm transition-colors",
        state === "ok"
          ? "border-emerald-200"
          : state === "missing"
            ? "border-brand-300 bg-brand-50/40"
            : "border-slate-200",
      )}
    >
      <button onClick={onToggleOk} className="flex min-h-14 flex-1 items-center gap-3 p-3.5 text-left">
        <span
          className={clsx(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
            state === "ok"
              ? "border-emerald-500 bg-emerald-500"
              : state === "missing"
                ? "border-brand-500 bg-brand-500"
                : "border-slate-300 bg-white",
          )}
        >
          {state === "ok" ? (
            <span className="pop-in">
              <Check className="h-4 w-4 text-white" strokeWidth={3.5} />
            </span>
          ) : state === "missing" ? (
            <span className="text-[13px] font-bold leading-none text-white">!</span>
          ) : null}
        </span>
        <span className="min-w-0">
          <span
            className={clsx(
              "block text-[15px] font-medium leading-snug",
              state === "missing" ? "text-brand-800" : "text-slate-800",
            )}
          >
            {item.label}
          </span>
          {answer?.obs ? (
            <span className="mt-0.5 block truncate text-[13px] italic text-slate-500">Obs: {answer.obs}</span>
          ) : null}
          {state === "missing" ? (
            <span className="mt-0.5 block text-[12px] font-bold uppercase tracking-wide text-brand-600">Faltando</span>
          ) : null}
        </span>
      </button>
      <button
        onClick={onOpenSheet}
        aria-label="Relatar falta ou observação"
        className="flex w-12 shrink-0 items-center justify-center rounded-r-2xl border-l border-slate-100 text-slate-400 active:bg-slate-50 active:text-brand-600"
      >
        <MessageSquarePlus className="h-5 w-5" />
      </button>
    </div>
  );
}
