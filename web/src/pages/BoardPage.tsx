import { useNavigate } from "react-router-dom";
import { CheckCircle2, ChevronRight, CircleDashed, WifiOff } from "lucide-react";
import clsx from "clsx";
import { api, usePolling, timeLabel, type BoardBase } from "../api";
import { AppHeader } from "../components/Header";

function BaseCard({ base, index }: { base: BoardBase; index: number }) {
  const navigate = useNavigate();
  const done = Boolean(base.submission);
  const sub = base.submission;

  return (
    <button
      style={{ animationDelay: `${Math.min(index * 30, 360)}ms` }}
      onClick={() => navigate(`/b/${base.code}`)}
      className={clsx(
        "card-in group relative flex w-full flex-col gap-1.5 rounded-2xl border bg-white p-4 text-left shadow-sm transition-transform active:scale-[0.98]",
        done ? "border-emerald-200" : "border-slate-200 active:border-brand-300",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-lg font-extrabold tracking-tight text-slate-900">{base.code}</span>
        {done ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {sub ? timeLabel(sub.createdAt) : ""}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
            <CircleDashed className="h-3.5 w-3.5" />
            pendente
          </span>
        )}
      </div>

      <div className="min-h-8">
        {done && sub ? (
          <>
            <p className="truncate text-[13px] font-medium text-slate-700">{sub.doctorName}</p>
            <p className="text-[12px] text-slate-500">
              {sub.missingCount > 0 ? (
                <span className="font-semibold text-brand-600">
                  🚫 {sub.missingCount} {sub.missingCount === 1 ? "item faltando" : "itens faltando"}
                </span>
              ) : (
                <span className="text-emerald-600">todos os itens conformes</span>
              )}
            </p>
          </>
        ) : base.doctorName ? (
          <>
            <p className="truncate text-[13px] font-medium text-slate-700">{base.doctorName}</p>
            <p className="text-[12px] text-slate-500">
              plantão {base.shiftLabel ?? "—"}
              {base.startedAt ? ` · desde ${timeLabel(base.startedAt)}` : ""}
            </p>
          </>
        ) : (
          <p className="text-[13px] italic text-slate-400">sem médico no quadro</p>
        )}
      </div>

      <ChevronRight className="absolute bottom-3 right-3 h-4 w-4 text-slate-300 transition-transform group-active:translate-x-0.5" />
    </button>
  );
}

export default function BoardPage() {
  const { data: board, error } = usePolling(api.board, 30_000);

  const doneCount = board?.bases.filter((b) => b.submission).length ?? 0;
  const total = board?.bases.length ?? 0;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-[max(env(safe-area-inset-top),1rem)]">
      <div className="sticky top-0 z-10 -mx-4 border-b border-slate-200/70 bg-slate-50/90 px-4 pb-3 pt-2 backdrop-blur">
        <AppHeader subtitle={board?.dayLabel ?? "carregando…"} />
        {board ? (
          <div className="mt-3 flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-emerald-500 transition-[width] duration-500 ease-out"
                style={{ width: total ? `${(doneCount / total) * 100}%` : "0%" }}
              />
            </div>
            <span className="text-[13px] font-semibold text-slate-600">
              {doneCount}/{total} feitos
            </span>
          </div>
        ) : null}
      </div>

      {error && !board ? (
        <div className="mt-10 flex flex-col items-center gap-2 text-slate-500">
          <WifiOff className="h-8 w-8" />
          <p className="text-sm">Sem conexão com o servidor. Tentando de novo…</p>
        </div>
      ) : null}

      {board?.degraded ? (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
          Quadro de plantão indisponível no momento — selecione sua USA e informe seu nome.
        </p>
      ) : null}

      <main className="mt-4 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
        {board?.bases.map((base, i) => <BaseCard key={base.code} base={base} index={i} />)}
        {!board && !error
          ? Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-white/70" />
            ))
          : null}
      </main>

      <footer className="mt-8 pb-2 text-center text-[11px] text-slate-400">
        Toque na sua USA para realizar o checklist do dia · SAMU 192 Salvador
      </footer>
    </div>
  );
}
