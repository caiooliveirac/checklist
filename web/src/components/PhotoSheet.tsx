import { useRef, useState } from "react";
import { Camera, ImagePlus, Loader2, Send, TriangleAlert } from "lucide-react";
import { api } from "../api";
import { compressImage } from "../lib/image";

/**
 * Bottom sheet para lançar uma inconformidade: o plantonista fotografa algo
 * fora do padrão na unidade, descreve, e a foto sobe (comprimida) para o banco.
 * Some após 7 dias; a coordenação recebe no Telegram na hora.
 */
export function PhotoSheet({
  baseCode,
  keyRequired,
  accessKey,
  doctorName,
  onAccessKey,
  onClose,
  onSubmitted,
}: {
  baseCode: string;
  keyRequired: boolean;
  accessKey: string;
  doctorName: string;
  onAccessKey: (key: string) => void;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function pickFile(file: File | undefined): Promise<void> {
    if (!file) return;
    setError("");
    setPreparing(true);
    try {
      setPhoto(await compressImage(file));
    } catch {
      setError("Não consegui processar a foto. Tente outra imagem.");
    } finally {
      setPreparing(false);
    }
  }

  async function submit(): Promise<void> {
    if (!photo || description.trim().length < 3) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await api.submitNonconformity({
        baseCode,
        accessKey,
        doctorName: doctorName.trim() || null,
        description: description.trim(),
        photo,
      });
      if (!res.ok) {
        setError(res.error ?? "Falha ao enviar. Tente novamente.");
        return;
      }
      onSubmitted();
    } catch {
      setError("Sem conexão com o servidor. Verifique a internet e tente de novo.");
    } finally {
      setSubmitting(false);
    }
  }

  const needsKey = keyRequired && accessKey.length < 4;
  const canSend = Boolean(photo) && description.trim().length >= 3 && !needsKey && !submitting;

  return (
    <>
      <div className="fade-in fixed inset-0 z-40 bg-slate-900/50" onClick={onClose} />
      <div className="sheet-in fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto rounded-t-3xl border-t border-slate-200 bg-white p-4 pb-[max(env(safe-area-inset-bottom),1rem)] shadow-2xl">
        <div className="mx-auto w-full max-w-md">
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-200" />
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-brand-600">
            <Camera className="h-4 w-4" />
            Inconformidade — {baseCode}
          </p>
          <h3 className="mt-0.5 text-[16px] font-bold leading-snug text-slate-900">
            Fotografe o que está fora do padrão
          </h3>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => void pickFile(e.target.files?.[0] ?? undefined)}
          />

          {photo ? (
            <button
              onClick={() => fileRef.current?.click()}
              className="mt-3 block w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100"
            >
              <img src={photo} alt="Prévia da foto" className="max-h-72 w-full object-contain" />
              <span className="flex items-center justify-center gap-1.5 py-2 text-[13px] font-semibold text-brand-600">
                <ImagePlus className="h-4 w-4" />
                Trocar foto
              </span>
            </button>
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              disabled={preparing}
              className="mt-3 flex min-h-32 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-brand-300 bg-brand-50/50 text-brand-600 active:bg-brand-50"
            >
              {preparing ? (
                <Loader2 className="h-8 w-8 animate-spin" />
              ) : (
                <>
                  <Camera className="h-8 w-8" />
                  <span className="text-[14px] font-semibold">Tirar / escolher foto</span>
                </>
              )}
            </button>
          )}

          <label className="mt-3 block text-[13px] font-medium text-slate-600" htmlFor="nc-desc">
            O que a foto mostra?
          </label>
          <textarea
            id="nc-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Ex.: cilindro de O2 com lacre rompido; maca com trava quebrada…"
            className="mt-1 w-full resize-none rounded-xl border border-slate-300 bg-slate-50 p-3 text-[15px] outline-none ring-brand-300 focus:bg-white focus:ring-2"
          />

          {needsKey ? (
            <>
              <label className="mt-3 block text-[13px] font-medium text-slate-600" htmlFor="nc-key">
                Chave do dia 🔑
              </label>
              <input
                id="nc-key"
                value={accessKey}
                onChange={(e) => onAccessKey(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="4 dígitos"
                inputMode="numeric"
                autoComplete="one-time-code"
                className="mt-1 min-h-12 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 text-[17px] font-bold tracking-[0.3em] outline-none ring-brand-300 focus:bg-white focus:ring-2"
              />
            </>
          ) : null}

          {error ? (
            <p className="mt-3 flex items-start gap-1.5 rounded-xl border border-brand-300 bg-brand-50 px-3 py-2 text-[13px] font-medium text-brand-800">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </p>
          ) : null}

          <div className="mt-4 grid grid-cols-1 gap-2">
            <button
              onClick={() => void submit()}
              disabled={!canSend}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 text-[15px] font-bold text-white shadow-sm active:bg-brand-700 disabled:bg-slate-300"
            >
              {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
              Enviar inconformidade
            </button>
            <button onClick={onClose} className="min-h-10 rounded-xl px-4 text-[14px] font-medium text-slate-500">
              Cancelar
            </button>
          </div>
          <p className="mt-2 text-center text-[11px] leading-relaxed text-slate-400">
            A coordenação recebe a foto no Telegram na hora. As fotos ficam visíveis nesta unidade e são apagadas após 7
            dias.
          </p>
        </div>
      </div>
    </>
  );
}
