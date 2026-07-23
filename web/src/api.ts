import { useCallback, useEffect, useRef, useState } from "react";

/** Tipos espelhando as respostas do servidor. */

export interface ChecklistItemDef {
  key: string;
  label: string;
  shortLabel: string;
  kind: "check" | "text" | "date";
  hint?: string;
  autoDefault?: "today" | "tomorrow";
}

export interface ChecklistGroupDef {
  key: string;
  title: string;
  items: ChecklistItemDef[];
}

export interface ChecklistDef {
  groups: ChecklistGroupDef[];
  totalItems: number;
  version: string;
}

export interface BoardSubmission {
  id: string;
  doctorName: string;
  okCount: number;
  missingCount: number;
  totalItems: number;
  createdAt: string;
}

export interface BoardBase {
  lastFields: Record<string, string>;
  code: string;
  doctorId: string | null;
  doctorName: string | null;
  fullName: string | null;
  shiftLabel: string | null;
  startedAt: string | null;
  scheduledEndAt: string | null;
  occupancyId: string | null;
  submission: BoardSubmission | null;
}

export interface Board {
  day: string;
  dayLabel: string;
  degraded: boolean;
  keyRequired: boolean;
  bases: BoardBase[];
}

export interface AnsweredItem {
  key: string;
  state: "ok" | "missing";
  obs?: string;
  value?: string;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

export interface HistoryItemRef {
  key: string;
  label: string;
  obs: string | null;
}

export interface HistoryDay {
  day: string;
  doctorName: string;
  createdAt: string;
  okCount: number;
  missingCount: number;
  missing: HistoryItemRef[];
  obs: HistoryItemRef[];
  values: { key: string; label: string; value: string }[];
}

export interface BaseHistory {
  code: string;
  windowDays: number;
  days: HistoryDay[];
  alerts: { key: string; label: string; sinceDay: string; obs: string | null; reportedBy: string }[];
  latestObs: { label: string; obs: string }[];
}

export interface Nonconformity {
  id: string;
  day: string;
  doctorName: string | null;
  description: string;
  createdAt: string;
  photoUrl: string;
}

export interface NonconformityList {
  code: string;
  items: Nonconformity[];
}

/** "2026-07-16" → "16/07". */
export function dayLabel(day: string): string {
  const [, m, d] = day.split("-");
  return `${d}/${m}`;
}

/** Data local (YYYY-MM-DD) com deslocamento em dias — para defaults de campos. */
export function localDay(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const api = {
  board: () => getJson<Board>("/api/board"),
  checklist: () => getJson<ChecklistDef>("/api/checklist"),
  history: (code: string) => getJson<BaseHistory>(`/api/history/${encodeURIComponent(code)}`),
  nonconformities: (code: string) =>
    getJson<NonconformityList>(`/api/nonconformities/${encodeURIComponent(code)}`),
  submitNonconformity: async (payload: {
    baseCode: string;
    accessKey?: string;
    doctorName?: string | null;
    description: string;
    photo: string;
  }): Promise<{ ok: boolean; error?: string; id?: string; createdAt?: string; photoUrl?: string }> => {
    const res = await fetch("/api/nonconformities", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    return (await res.json()) as {
      ok: boolean;
      error?: string;
      id?: string;
      createdAt?: string;
      photoUrl?: string;
    };
  },
  verifyKey: async (baseCode: string, key: string): Promise<{ ok: boolean; required: boolean }> => {
    const res = await fetch("/api/keys/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ baseCode, key }),
    });
    return (await res.json()) as { ok: boolean; required: boolean };
  },
  submit: async (payload: {
    baseCode: string;
    accessKey?: string;
    doctorName: string;
    doctorId?: string | null;
    occupancyId?: string | null;
    shiftLabel?: string | null;
    items: AnsweredItem[];
  }): Promise<{ ok: boolean; error?: string; createdAt?: string; missingCount?: number }> => {
    const res = await fetch("/api/submissions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    return (await res.json()) as { ok: boolean; error?: string; createdAt?: string; missingCount?: number };
  },
};

/** Busca com atualização periódica (board a cada 30s). */
export function usePolling<T>(fetcher: () => Promise<T>, intervalMs: number): {
  data: T | null;
  error: boolean;
  reload: () => void;
} {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState(false);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const load = useCallback(() => {
    fetcherRef
      .current()
      .then((d) => {
        setData(d);
        setError(false);
      })
      .catch(() => setError(true));
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, intervalMs);
    const onVisible = (): void => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs, load]);

  return { data, error, reload: load };
}

/** "08:12" locais a partir de ISO (o navegador dos médicos está no fuso da Bahia). */
export function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
