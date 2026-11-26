"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { validateImport, type CRMState } from "./model";

type Snapshot =
  | { state: CRMState; revision: number }
  | { state: null; revision: null };

const ENDPOINT = "/api/crm/workspace";

function workspaceSnapshot(value: unknown): Snapshot {
  if (!value || typeof value !== "object" || !("state" in value) || !("revision" in value)) {
    throw new Error("The CRM could not verify the shared workspace response.");
  }
  if (value.state === null && value.revision === null) return { state: null, revision: null };
  if (typeof value.revision !== "number" || !Number.isInteger(value.revision) || value.revision < 1) {
    throw new Error("The CRM could not verify the shared workspace version.");
  }
  return { state: validateImport(value.state), revision: value.revision };
}

async function responseBody(response: Response, fallback: string): Promise<unknown> {
  const data: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const detail = data && typeof data === "object" && "error" in data && typeof data.error === "string"
      ? data.error : fallback;
    throw new Error(response.status === 413 ? "This workspace exceeds the online save limit. Keep a backup and reduce its size before trying again." : detail);
  }
  return data;
}

function message(reason: unknown, fallback: string) {
  return reason instanceof Error ? reason.message : fallback;
}

export function useSharedCrmStore() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const activeLoad = useRef<AbortController | null>(null);
  const activeSave = useRef<AbortController | null>(null);
  const current = useRef<Snapshot | null>(null);

  const publish = useCallback((next: Snapshot | null) => {
    current.current = next;
    setSnapshot(next);
  }, []);

  const load = useCallback(() => {
    if (activeSave.current) return Promise.resolve();
    activeLoad.current?.abort();
    const controller = new AbortController();
    activeLoad.current = controller;
    const signal = controller.signal;
    return fetch(ENDPOINT, { cache: "no-store", signal })
      .then(async (response) => {
        if (response.status === 401 && !signal.aborted) {
          publish(null);
          setSessionExpired(true);
        }
        const next = workspaceSnapshot(await responseBody(response, "The shared workspace could not be loaded."));
        if (!signal.aborted) {
          publish(next);
          setLoaded(true);
          setSessionExpired(false);
        }
      })
      .catch((reason: unknown) => {
        if (!signal.aborted) setError(message(reason, "The shared workspace could not be loaded."));
      })
      .finally(() => {
        if (activeLoad.current === controller) {
          activeLoad.current = null;
          setLoading(false);
        }
      });
  }, [publish]);

  useEffect(() => {
    void load();
    return () => {
      activeLoad.current?.abort();
      activeLoad.current = null;
      activeSave.current?.abort();
      activeSave.current = null;
    };
  }, [load]);

  async function reload() {
    if (activeSave.current) return;
    setLoading(true);
    setError(null);
    await load();
  }

  async function save(next: CRMState): Promise<void> {
    if (!snapshot || activeLoad.current || current.current !== snapshot) {
      throw new Error("The workspace changed. Review the latest records and try your edit again.");
    }
    if (activeSave.current) throw new Error("Please wait for the current save to finish.");

    const controller = new AbortController();
    activeSave.current = controller;
    const signal = controller.signal;
    setSaving(true);
    setError(null);
    try {
      const state = validateImport(next);
      const body = JSON.stringify({ state, revision: snapshot.revision });
      const response = await fetch(ENDPOINT, {
        method: "PUT",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body,
        signal,
      });
      if (response.status === 401 && !signal.aborted) {
        publish(null);
        setSessionExpired(true);
      }
      const saved = workspaceSnapshot(await responseBody(response, "The save could not be confirmed. Reload the shared workspace before trying again."));
      if (!signal.aborted) publish(saved);
    } catch (reason) {
      if (!signal.aborted) setError(message(reason, "The save could not be confirmed. Reload the shared workspace before trying again."));
      throw reason;
    } finally {
      if (activeSave.current === controller) {
        activeSave.current = null;
        setSaving(false);
      }
    }
  }

  return {
    state: snapshot?.state ?? null,
    revision: snapshot?.revision ?? null,
    loaded,
    loading,
    saving,
    error,
    sessionExpired,
    reload,
    save,
  };
}
