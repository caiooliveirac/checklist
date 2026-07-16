import { useCallback, useEffect, useRef, useState } from "react";

/** Tipos espelhando as respostas do servidor. */

export interface ChecklistItemDef {
  key: string;
  label: string;
  shortLabel: string;
  kind: "check" | "text" | "date";
  hint?: string;
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

export const api = {
  board: () => getJson<Board>("/api/board"),
  checklist: () => getJson<ChecklistDef>("/api/checklist"),
  submit: async (payload: {
    baseCode: string;
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
