import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import confetti from "canvas-confetti";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Camera,
  CheckCheck,
  CheckCircle2,
  ChevronLeft,
  ClipboardList,
  History,
  Loader2,
  PartyPopper,
  Send,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import clsx from "clsx";
import {
  api,
  dayLabel,
  localDay,
  timeLabel,
  type AnsweredItem,
  type BaseHistory,
  type Board,
  type BoardBase,
  type ChecklistDef,
  type ChecklistItemDef,
  type Nonconformity,
} from "../api";
import { ItemRow } from "../components/ItemRow";
import { ObsSheet } from "../components/ObsSheet";
import { HistoryModal } from "../components/HistoryModal";
import { PhotoSheet } from "../components/PhotoSheet";
import { NonconformitySection } from "../components/NonconformitySection";

type Phase = { kind: "intro" } | { kind: "group"; index: number } | { kind: "review" } | { kind: "done" };

interface Draft {
  answers: Record<string, AnsweredItem>;
  doctorName: string;
  accessKey?: string;
  savedAt: string;
}

function draftKey(day: string, code: string): string {
  return `checklist-draft:${day}:${code}`;
}

function loadDraft(day: string, code: string): Draft | null {
  try {
    const raw = localStorage.getItem(draftKey(day, code));
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

export default function ChecklistPage() {
  const { code = "" } = useParams();
  const baseCode = code.toUpperCase();
  const navigate = useNavigate();

  const [def, setDef] = useState<ChecklistDef | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [loadError, setLoadError] = useState(false);

  const [phase, setPhase] = useState<Phase>({ kind: "intro" });
  const [answers, setAnswers] = useState<Record<string, AnsweredItem>>({});
  const [doctorName, setDoctorName] = useState("");
  const [accessKey, setAccessKey] = useState("");
  const [keyError, setKeyError] = useState("");
  const [verifyingKey, setVerifyingKey] = useState(false);
  const [sheetItem, setSheetItem] = useState<ChecklistItemDef | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [doneAt, setDoneAt] = useState<string | null>(null);
  const [history, setHistory] = useState<BaseHistory | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [nonconformities, setNonconformities] = useState<Nonconformity[]>([]);
  const [showPhoto, setShowPhoto] = useState(false);
  const [photoDone, setPhotoDone] = useState(false);
  const hydrated = useRef(false);

  function reloadNonconformities(): void {
    api
      .nonconformities(baseCode)
      .then((r) => setNonconformities(r.items))
      .catch(() => setNonconformities([]));
  }

  useEffect(() => {
    Promise.all([api.checklist(), api.board()])
      .then(([d, b]) => {
        setDef(d);
        setBoard(b);
      })
      .catch(() => setLoadError(true));
    api.history(baseCode).then(setHistory).catch(() => setHistory(null));
    reloadNonconformities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseCode]);

  const base: BoardBase | null = useMemo(
    () => board?.bases.find((b) => b.code === baseCode) ?? null,
    [board, baseCode],
  );

  // Hidrata rascunho do dia, pré-preenche nome do plantonista e os campos de
  // lacre/datas (valor herdado do último checklist ou default hoje/amanhã).
  useEffect(() => {
    if (!board || !def || hydrated.current) return;
    hydrated.current = true;
    const draft = loadDraft(board.day, baseCode);
    const initial: Record<string, AnsweredItem> = { ...(draft?.answers ?? {}) };
    for (const g of def.groups) {
      for (const item of g.items) {
        if (item.kind === "check" || initial[item.key]) continue;
        const inherited = base?.lastFields?.[item.key];
        const fallback =
          item.autoDefault === "today" ? localDay(0) : item.autoDefault === "tomorrow" ? localDay(1) : "";
        const value = inherited ?? fallback;
        if (value) initial[item.key] = { key: item.key, state: "ok", value };
      }
    }
    setAnswers(initial);
    if (draft?.doctorName) setDoctorName(draft.doctorName);
    else if (base?.doctorName) setDoctorName(base.doctorName);
    if (draft?.accessKey) setAccessKey(draft.accessKey);
  }, [board, def, base, baseCode]);

  // Persiste rascunho a cada mudança.
  useEffect(() => {
    if (!board || !hydrated.current) return;
    const draft: Draft = { answers, doctorName, accessKey, savedAt: new Date().toISOString() };
    try {
      localStorage.setItem(draftKey(board.day, baseCode), JSON.stringify(draft));
    } catch {
      /* armazenamento cheio/indisponível — segue sem rascunho */
    }
  }, [answers, doctorName, accessKey, board, baseCode]);

  const groups = def?.groups ?? [];
  const totalItems = def?.totalItems ?? 0;
  const answeredCount = useMemo(
    () => groups.flatMap((g) => g.items).filter((i) => answers[i.key]).length,
    [groups, answers],
  );
  const missingCount = useMemo(() => Object.values(answers).filter((a) => a.state === "missing").length, [answers]);

  const groupIndex = phase.kind === "group" ? phase.index : 0;
  const currentGroup = groups[groupIndex];
  const groupComplete = currentGroup?.items.every((i) => answers[i.key]) ?? false;

  function setAnswer(item: ChecklistItemDef, patch: Partial<AnsweredItem> | null): void {
    setAnswers((prev) => {
      const next = { ...prev };
      if (patch === null) {
        delete next[item.key];
        return next;
      }
      const existing = prev[item.key];
      const merged: AnsweredItem = {
        key: item.key,
        state: patch.state ?? existing?.state ?? "ok",
      };
      const obs = patch.obs !== undefined ? patch.obs : existing?.obs;
      if (obs) merged.obs = obs;
      const value = patch.value !== undefined ? patch.value : existing?.value;
      if (value) merged.value = value;
      next[item.key] = merged;
      return next;
    });
  }

  function toggleOk(item: ChecklistItemDef): void {
    const current = answers[item.key];
    if (current?.state === "ok") setAnswer(item, null);
    else setAnswer(item, { state: "ok" });
  }

  function fieldChange(item: ChecklistItemDef, value: string): void {
    if (value.trim()) setAnswer(item, { state: "ok", value });
    else setAnswer(item, null);
  }

  function goTo(next: Phase): void {
    setPhase(next);
    window.scrollTo({ top: 0 });
  }

  async function startChecklist(): Promise<void> {
    if (!board?.keyRequired) {
      goTo({ kind: "group", index: 0 });
      return;
    }
    setVerifyingKey(true);
    setKeyError("");
    try {
      const res = await api.verifyKey(baseCode, accessKey);
      if (res.ok) goTo({ kind: "group", index: 0 });
      else setKeyError("Chave incorreta. Peça ao @samu_checklists_bot no privado, ou /chave no grupo do plantões.");
    } catch {
      setKeyError("Não consegui validar a chave — verifique a conexão.");
    } finally {
      setVerifyingKey(false);
    }
  }

  async function submit(): Promise<void> {
    if (!def || !board) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const items = groups.flatMap((g) => g.items).map((i) => answers[i.key]!).filter(Boolean);
      const res = await api.submit({
        baseCode,
        accessKey,
        doctorName: doctorName.trim(),
        doctorId: base?.doctorId ?? null,
        occupancyId: base?.occupancyId ?? null,
        shiftLabel: base?.shiftLabel ?? null,
        items,
      });
      if (!res.ok) {
        setSubmitError(res.error ?? "Falha ao enviar. Tente novamente.");
        return;
      }
      localStorage.removeItem(draftKey(board.day, baseCode));
      setDoneAt(res.createdAt ?? new Date().toISOString());
      goTo({ kind: "done" });
      confetti({ particleCount: 140, spread: 75, origin: { y: 0.7 }, disableForReducedMotion: true });
    } catch {
      setSubmitError("Sem conexão com o servidor. Verifique a internet e tente de novo.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
        <TriangleAlert className="h-9 w-9 text-brand-500" />
        <p className="text-[15px] text-slate-600">Não consegui carregar o checklist. Verifique a conexão.</p>
        <button
          onClick={() => window.location.reload()}
          className="min-h-11 rounded-xl bg-brand-600 px-5 font-semibold text-white"
        >
          Tentar de novo
        </button>
      </div>
    );
  }

  if (!def || !board) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
      </div>
    );
  }

  const phaseKey =
    phase.kind === "group" ? `group-${phase.index}` : phase.kind;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-36 pt-[max(env(safe-area-inset-top),0.75rem)]">
      {/* Cabeçalho fixo com progresso */}
      <div className="sticky top-0 z-10 -mx-4 border-b border-slate-200/70 bg-slate-50/95 px-4 pb-2.5 pt-2 backdrop-blur">
        <div className="flex items-center gap-2">
          <button
            onClick={() => (phase.kind === "intro" || phase.kind === "done" ? navigate("/") : goTo({ kind: "intro" }))}
            aria-label="Voltar"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm active:bg-slate-100"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-extrabold tracking-tight text-slate-900">
              {baseCode}
              <span className="ml-2 align-middle text-[12px] font-semibold uppercase tracking-wide text-brand-600">
                checklist USA
              </span>
            </h1>
            <p className="truncate text-[12px] text-slate-500">{board.dayLabel}</p>
          </div>
          {phase.kind !== "intro" && phase.kind !== "done" ? (
            <span className="rounded-full bg-white px-2.5 py-1 text-[12px] font-bold text-slate-600 shadow-sm ring-1 ring-slate-200">
              {answeredCount}/{totalItems}
            </span>
          ) : null}
          <button
            onClick={() => setShowPhoto(true)}
            aria-label="Registrar inconformidade com foto"
            className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-brand-600 shadow-sm active:bg-slate-100"
          >
            <Camera className="h-5 w-5" />
            {nonconformities.length > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
                {nonconformities.length}
              </span>
            ) : null}
          </button>
          <button
            onClick={() => setShowHistory(true)}
            aria-label="Checklists anteriores"
            className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm active:bg-slate-100"
          >
            <History className="h-5 w-5" />
            {history && history.alerts.length > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
                {history.alerts.length}
              </span>
            ) : null}
          </button>
        </div>
        {phase.kind !== "intro" && phase.kind !== "done" ? (
          <>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
              <div
                className={clsx(
                  "h-full rounded-full transition-[width] duration-300 ease-out",
                  missingCount > 0 ? "bg-accent-500" : "bg-emerald-500",
                )}
                style={{ width: totalItems ? `${(answeredCount / totalItems) * 100}%` : "0%" }}
              />
            </div>
            {/* Navegação livre entre seções */}
            <div className="-mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
              {groups.map((g, i) => {
                const total = g.items.length;
                const done = g.items.filter((it) => answers[it.key]).length;
                const current = phase.kind === "group" && phase.index === i;
                return (
                  <button
                    key={g.key}
                    onClick={() => goTo({ kind: "group", index: i })}
                    aria-label={`Seção ${i + 1}: ${g.title}`}
                    className={clsx(
                      "flex h-8 min-w-8 shrink-0 items-center justify-center rounded-full px-2.5 text-[12px] font-bold transition-colors",
                      current
                        ? "bg-brand-600 text-white"
                        : done === total
                          ? "bg-emerald-100 text-emerald-700"
                          : done > 0
                            ? "bg-amber-100 text-amber-700"
                            : "bg-white text-slate-500 ring-1 ring-slate-200",
                    )}
                  >
                    {done === total && !current ? "✓ " : ""}
                    {i + 1}
                  </button>
                );
              })}
              <button
                onClick={() => goTo({ kind: "review" })}
                className={clsx(
                  "flex h-8 shrink-0 items-center rounded-full px-3 text-[12px] font-bold transition-colors",
                  phase.kind === "review" ? "bg-brand-600 text-white" : "bg-white text-slate-500 ring-1 ring-slate-200",
                )}
              >
                Revisar
              </button>
            </div>
          </>
        ) : null}
      </div>

      {/* ---------- INTRO ---------- */}
      {phase.kind === "intro" ? (
        <main key={phaseKey} className="step-in">
          {history && (history.alerts.length > 0 || history.latestObs.length > 0) ? (
            <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4">
              <p className="text-[12px] font-bold uppercase tracking-wide text-amber-800">
                ⚠️ Atenção — do último checklist
              </p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {history.alerts.map((a) => (
                  <li key={a.key} className="text-[14px] leading-snug text-amber-900">
                    🚫 <b>{a.label}</b> — em falta desde {dayLabel(a.sinceDay)}
                    <span className="text-amber-800/90"> · informado por {a.reportedBy}</span>
                    {a.obs ? <span className="text-amber-800/80"> — {a.obs}</span> : null}
                  </li>
                ))}
                {history.latestObs.map((o, i) => (
                  <li key={i} className="text-[14px] leading-snug text-amber-900">
                    📝 {o.label} — <i>{o.obs}</i>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => setShowHistory(true)}
                className="mt-2.5 text-[13px] font-semibold text-amber-800 underline underline-offset-2"
              >
                Ver checklists anteriores →
              </button>
            </div>
          ) : null}

          {base?.submission ? (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="flex items-center gap-2 text-[14px] font-semibold text-emerald-800">
                <BadgeCheck className="h-5 w-5" />
                Checklist de hoje já enviado às {timeLabel(base.submission.createdAt)}
              </p>
              <p className="mt-1 text-[13px] text-emerald-700">
                por {base.submission.doctorName}
                {base.submission.missingCount > 0
                  ? ` — ${base.submission.missingCount} ${base.submission.missingCount === 1 ? "item faltando" : "itens faltando"}`
                  : " — tudo conforme"}
                . Você pode refazer se precisar corrigir.
              </p>
            </div>
          ) : null}

          <NonconformitySection items={nonconformities} />

          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-400">Médico do plantão</p>
            {base?.doctorName ? (
              <p className="mt-1 flex items-center gap-2 text-[15px] font-semibold text-slate-800">
                <UserRound className="h-5 w-5 text-brand-500" />
                {base.doctorName}
                {base.shiftLabel ? (
                  <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-700">
                    {base.shiftLabel}
                  </span>
                ) : null}
              </p>
            ) : (
              <p className="mt-1 text-[13px] italic text-slate-400">sem registro no quadro do plantões</p>
            )}
            <label className="mt-3 block text-[13px] font-medium text-slate-600" htmlFor="doctor">
              Confirme seu nome
            </label>
            <input
              id="doctor"
              value={doctorName}
              onChange={(e) => setDoctorName(e.target.value)}
              placeholder="Nome do médico"
              autoComplete="name"
              className="mt-1 min-h-12 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 text-[15px] outline-none ring-brand-300 focus:bg-white focus:ring-2"
            />
            {board.keyRequired ? (
              <>
                <label className="mt-3 block text-[13px] font-medium text-slate-600" htmlFor="access-key">
                  Chave do dia 🔑
                </label>
                <input
                  id="access-key"
                  value={accessKey}
                  onChange={(e) => {
                    setAccessKey(e.target.value.replace(/\D/g, "").slice(0, 4));
                    setKeyError("");
                  }}
                  placeholder="4 dígitos"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  className="mt-1 min-h-12 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 text-[17px] font-bold tracking-[0.3em] outline-none ring-brand-300 focus:bg-white focus:ring-2"
                />
                <p className="mt-1.5 text-[12px] leading-relaxed text-slate-400">
                  O bot{" "}
                  <a
                    href="https://t.me/samu_checklists_bot"
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-brand-600 underline underline-offset-2"
                  >
                    @samu_checklists_bot
                  </a>{" "}
                  envia a chave no privado (ou digite /chave no grupo do plantões).
                </p>
                {keyError ? (
                  <p className="mt-2 rounded-xl border border-brand-300 bg-brand-50 px-3 py-2 text-[13px] font-medium text-brand-800">
                    {keyError}
                  </p>
                ) : null}
              </>
            ) : null}
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="flex items-center gap-2 text-[14px] font-semibold text-slate-700">
              <ClipboardList className="h-5 w-5 text-brand-500" />
              {def.totalItems} itens em {groups.length} seções
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
              Confira item a item: toque para marcar <b className="text-emerald-600">conforme</b>, ou use o botão
              lateral para registrar <b className="text-brand-600">falta/observação</b>. O rascunho fica salvo neste
              aparelho.
            </p>
          </div>

          {answeredCount > 0 ? (
            <p className="mt-3 text-center text-[13px] font-medium text-slate-500">
              Rascunho recuperado: {answeredCount}/{totalItems} itens já marcados
            </p>
          ) : null}
        </main>
      ) : null}

      {/* ---------- GRUPO ---------- */}
      {phase.kind === "group" && currentGroup ? (
        <main key={phaseKey} className="step-in">
          <div className="mt-4 flex items-baseline justify-between gap-2">
            <h2 className="text-[15px] font-bold uppercase tracking-wide text-brand-700">{currentGroup.title}</h2>
            <span className="shrink-0 text-[12px] font-semibold text-slate-400">
              seção {groupIndex + 1}/{groups.length}
            </span>
          </div>
          <div className="mt-3 flex flex-col gap-2.5">
            {currentGroup.items.map((item) => (
              <ItemRow
                key={item.key}
                item={item}
                answer={answers[item.key]}
                onToggleOk={() => toggleOk(item)}
                onOpenSheet={() => setSheetItem(item)}
                onFieldChange={(v) => fieldChange(item, v)}
              />
            ))}
          </div>
          <button
            onClick={() => {
              const missing = currentGroup.items.filter((i) => !answers[i.key] && i.kind === "check");
              missing.forEach((i) => setAnswer(i, { state: "ok" }));
            }}
            className={clsx(
              "mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-[13px] font-semibold",
              groupComplete ? "invisible" : "text-emerald-700 active:bg-emerald-50",
            )}
          >
            <CheckCheck className="h-4 w-4" />
            Marcar restantes da seção como conformes
          </button>
        </main>
      ) : null}

      {/* ---------- REVISÃO ---------- */}
      {phase.kind === "review" ? (
        <main key={phaseKey} className="step-in">
          <h2 className="mt-4 text-[15px] font-bold uppercase tracking-wide text-brand-700">Revisão e envio</h2>

          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-center">
              <p className="text-2xl font-extrabold text-emerald-700">{answeredCount - missingCount}</p>
              <p className="text-[12px] font-semibold text-emerald-700">conformes</p>
            </div>
            <div
              className={clsx(
                "rounded-2xl border p-3 text-center",
                missingCount > 0 ? "border-brand-300 bg-brand-50" : "border-slate-200 bg-white",
              )}
            >
              <p className={clsx("text-2xl font-extrabold", missingCount > 0 ? "text-brand-700" : "text-slate-400")}>
                {missingCount}
              </p>
              <p className={clsx("text-[12px] font-semibold", missingCount > 0 ? "text-brand-700" : "text-slate-400")}>
                faltando
              </p>
            </div>
          </div>

          {answeredCount < totalItems ? (
            <div className="mt-3 rounded-2xl border border-amber-300 bg-amber-50 p-4">
              <p className="text-[13px] font-bold text-amber-800">
                Ainda faltam responder {totalItems - answeredCount}{" "}
                {totalItems - answeredCount === 1 ? "item" : "itens"}:
              </p>
              <div className="mt-2 flex flex-col gap-1.5">
                {groups
                  .map((g, index) => ({ g, index, count: g.items.filter((i) => !answers[i.key]).length }))
                  .filter((x) => x.count > 0)
                  .map(({ g, index, count }) => (
                    <button
                      key={g.key}
                      onClick={() => goTo({ kind: "group", index })}
                      className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-left text-[13px] font-semibold text-amber-900 ring-1 ring-amber-200 active:bg-amber-100"
                    >
                      <span>
                        Seção {index + 1} — {g.title}
                      </span>
                      <span className="shrink-0 text-amber-700">
                        {count} {count === 1 ? "item" : "itens"} →
                      </span>
                    </button>
                  ))}
              </div>
            </div>
          ) : null}

          {missingCount > 0 ? (
            <div className="mt-3 rounded-2xl border border-brand-200 bg-white p-4 shadow-sm">
              <p className="text-[13px] font-bold uppercase tracking-wide text-brand-700">Itens faltando</p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {groups
                  .flatMap((g) => g.items)
                  .filter((i) => answers[i.key]?.state === "missing")
                  .map((i) => (
                    <li key={i.key} className="text-[14px] leading-snug text-slate-700">
                      🚫 <b>{i.shortLabel}</b>
                      {answers[i.key]?.obs ? <span className="text-slate-500"> — {answers[i.key]?.obs}</span> : null}
                    </li>
                  ))}
              </ul>
            </div>
          ) : answeredCount === totalItems ? (
            <p className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-center text-[14px] font-medium text-emerald-800">
              Todos os itens conformes ✨
            </p>
          ) : null}

          <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <label className="text-[13px] font-medium text-slate-600" htmlFor="doctor-review">
              Enviando como
            </label>
            <input
              id="doctor-review"
              value={doctorName}
              onChange={(e) => setDoctorName(e.target.value)}
              placeholder="Nome do médico"
              className="mt-1 min-h-12 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 text-[15px] outline-none ring-brand-300 focus:bg-white focus:ring-2"
            />
            <p className="mt-2 text-[12px] text-slate-400">A coordenação recebe o resultado no Telegram imediatamente.</p>
          </div>

          {submitError ? (
            <p className="mt-3 rounded-xl border border-brand-300 bg-brand-50 px-3 py-2 text-[13px] font-medium text-brand-800">
              {submitError}
            </p>
          ) : null}
        </main>
      ) : null}

      {/* ---------- CONCLUÍDO ---------- */}
      {phase.kind === "done" ? (
        <main key={phaseKey} className="step-in flex flex-1 flex-col items-center justify-center py-16 text-center">
          <div className="pop-in flex h-24 w-24 items-center justify-center rounded-full bg-emerald-100">
            <CheckCircle2 className="h-14 w-14 text-emerald-600" strokeWidth={2.2} />
          </div>
          <h2 className="mt-5 text-xl font-extrabold tracking-tight text-slate-900">Checklist enviado!</h2>
          <p className="mt-1 text-[14px] text-slate-500">
            {baseCode} · {doneAt ? timeLabel(doneAt) : ""} · {doctorName}
          </p>
          <p className="mt-4 flex items-center gap-2 rounded-full bg-white px-4 py-2 text-[13px] font-medium text-slate-600 shadow-sm ring-1 ring-slate-200">
            <PartyPopper className="h-4 w-4 text-accent-500" />
            A coordenação já foi avisada no Telegram
          </p>
          {missingCount > 0 ? (
            <p className="mt-3 text-[13px] font-medium text-brand-700">
              🚫 {missingCount} {missingCount === 1 ? "item reportado como faltando" : "itens reportados como faltando"}
            </p>
          ) : null}
          <Link
            to="/"
            className="mt-8 inline-flex min-h-12 items-center justify-center rounded-xl bg-brand-600 px-6 text-[15px] font-semibold text-white shadow-sm active:bg-brand-700"
          >
            Voltar ao painel
          </Link>
        </main>
      ) : null}

      {/* Barra de ação fixa */}
      {phase.kind !== "done" ? (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 backdrop-blur">
          <div className="mx-auto flex w-full max-w-md gap-2.5">
            {phase.kind === "group" && groupIndex > 0 ? (
              <button
                onClick={() => goTo({ kind: "group", index: groupIndex - 1 })}
                className="inline-flex min-h-13 w-24 items-center justify-center gap-1 rounded-xl border border-slate-300 bg-white text-[14px] font-semibold text-slate-600 active:bg-slate-50"
              >
                <ArrowLeft className="h-4 w-4" />
                Voltar
              </button>
            ) : null}

            {phase.kind === "intro" ? (
              <button
                onClick={() => void startChecklist()}
                disabled={
                  verifyingKey || doctorName.trim().length < 3 || (board.keyRequired && accessKey.length < 4)
                }
                className="inline-flex min-h-13 flex-1 items-center justify-center gap-2 rounded-xl bg-brand-600 text-[16px] font-bold text-white shadow-sm active:bg-brand-700 disabled:bg-slate-300"
              >
                {verifyingKey ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    {answeredCount > 0 ? "Continuar checklist" : "Iniciar checklist"}
                    <ArrowRight className="h-5 w-5" />
                  </>
                )}
              </button>
            ) : null}

            {phase.kind === "group" ? (
              <button
                onClick={() =>
                  groupIndex + 1 < groups.length
                    ? goTo({ kind: "group", index: groupIndex + 1 })
                    : goTo({ kind: "review" })
                }
                className={clsx(
                  "inline-flex min-h-13 flex-1 items-center justify-center gap-2 rounded-xl text-[16px] font-bold text-white shadow-sm",
                  groupComplete ? "bg-brand-600 active:bg-brand-700" : "bg-brand-400 active:bg-brand-500",
                )}
              >
                {groupIndex + 1 < groups.length ? "Próxima seção" : "Revisar e enviar"}
                <ArrowRight className="h-5 w-5" />
              </button>
            ) : null}

            {phase.kind === "review" ? (
              <>
                <button
                  onClick={() => goTo({ kind: "group", index: groups.length - 1 })}
                  className="inline-flex min-h-13 w-24 items-center justify-center gap-1 rounded-xl border border-slate-300 bg-white text-[14px] font-semibold text-slate-600 active:bg-slate-50"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Voltar
                </button>
                <button
                  onClick={() => void submit()}
                  disabled={submitting || doctorName.trim().length < 3 || answeredCount < totalItems}
                  className="inline-flex min-h-13 flex-1 items-center justify-center gap-2 rounded-xl bg-brand-600 text-[16px] font-bold text-white shadow-sm active:bg-brand-700 disabled:bg-slate-300"
                >
                  {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                  Enviar checklist
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {showHistory ? <HistoryModal code={baseCode} history={history} onClose={() => setShowHistory(false)} /> : null}

      {showPhoto ? (
        <PhotoSheet
          baseCode={baseCode}
          keyRequired={board.keyRequired}
          accessKey={accessKey}
          doctorName={doctorName}
          onAccessKey={setAccessKey}
          onClose={() => setShowPhoto(false)}
          onSubmitted={() => {
            setShowPhoto(false);
            setPhotoDone(true);
            reloadNonconformities();
            window.setTimeout(() => setPhotoDone(false), 3500);
          }}
        />
      ) : null}

      {photoDone ? (
        <div className="pop-in fixed inset-x-0 bottom-24 z-50 mx-auto flex w-max max-w-[92%] items-center gap-2 rounded-full bg-slate-900/90 px-4 py-2.5 text-[13px] font-semibold text-white shadow-lg">
          <Camera className="h-4 w-4 text-emerald-400" />
          Inconformidade enviada — coordenação avisada
        </div>
      ) : null}

      <ObsSheet
        item={sheetItem}
        initialObs={sheetItem ? (answers[sheetItem.key]?.obs ?? "") : ""}
        onClose={() => setSheetItem(null)}
        onConfirm={(result) => {
          if (sheetItem) {
            setAnswer(sheetItem, { state: result.state, obs: result.obs });
          }
          setSheetItem(null);
        }}
      />
    </div>
  );
}
