'use client';

import { useSyncExternalStore } from 'react';
import { createDemoState, createEmptyState, validateImport, type CRMState } from './model';

export const CRM_STORAGE_KEY = 'oliphant-removal-crm-v1';
const MAX_BACKUP_BYTES = 5_000_000;

type Snapshot = { state: CRMState | null; error: string | null };
const serverSnapshot: Snapshot = { state: null, error: null };
let snapshot: Snapshot = serverSnapshot;
let initialized = false;
let lastStoredRaw: string | null = null;
let unreadableRaw: string | null = null;
const listeners = new Set<() => void>();

function publish(next: Snapshot) {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

function checkBackupSize(state: CRMState) {
  // Match the exported file, including indentation and UTF-8 multibyte characters.
  const bytes = new TextEncoder().encode(JSON.stringify(state, null, 2)).byteLength;
  if (bytes > MAX_BACKUP_BYTES) {
    throw new Error('The CRM backup exceeds the 5 MB limit. Export a backup and reduce the number of records.');
  }
}

function parse(raw: string): CRMState {
  if (raw.length > MAX_BACKUP_BYTES) throw new Error('The saved CRM data exceeds the 5 MB limit.');
  const state = validateImport(JSON.parse(raw));
  checkBackupSize(state);
  return state;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'An unknown storage error occurred.';
}

function initialize() {
  if (initialized) return;
  initialized = true;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(CRM_STORAGE_KEY);
    lastStoredRaw = raw;
    if (raw !== null) {
      publish({ state: parse(raw), error: null });
      return;
    }

    const state = createDemoState();
    const serialized = JSON.stringify(state);
    window.localStorage.setItem(CRM_STORAGE_KEY, serialized);
    lastStoredRaw = serialized;
    publish({ state, error: null });
  } catch (error) {
    if (raw !== null) {
      unreadableRaw = raw;
      publish({
        state: createEmptyState(),
        error: `Saved CRM data could not be loaded: ${message(error)} The original is still stored; replacing it will preserve a recovery copy.`,
      });
    } else {
      publish({
        state: createDemoState(),
        error: 'Browser storage is unavailable or full. Changes cannot be saved. Enable browser storage or free some space, then try again.',
      });
    }
  }
}

function acceptExternal(raw: string | null) {
  if (raw === lastStoredRaw) return;
  try {
    const state = raw === null ? createEmptyState() : parse(raw);
    lastStoredRaw = raw;
    unreadableRaw = null;
    publish({ state, error: null });
  } catch (error) {
    lastStoredRaw = raw;
    unreadableRaw = raw;
    publish({
      state: snapshot.state ?? createEmptyState(),
      error: `Another tab saved CRM data that could not be read: ${message(error)} Your current view has been preserved. Export a backup before continuing.`,
    });
  }
}

function onStorage(event: StorageEvent) {
  if (event.key === CRM_STORAGE_KEY || event.key === null) {
    // A clear() event has no newValue; it removes this CRM's saved data too.
    acceptExternal(event.key === null ? null : event.newValue);
  }
}

function subscribe(listener: () => void) {
  const first = listeners.size === 0;
  listeners.add(listener);
  if (first) {
    window.addEventListener('storage', onStorage);
    if (initialized) {
      try {
        acceptExternal(window.localStorage.getItem(CRM_STORAGE_KEY));
      } catch {
        publish({ ...snapshot, error: 'Browser storage is unavailable. Changes cannot be saved until browser storage is enabled.' });
      }
    } else {
      initialize();
    }
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener('storage', onStorage);
  };
}

function save(nextState: CRMState) {
  initialize();
  try {
    const state = validateImport(nextState);
    const serialized = JSON.stringify(state);
    checkBackupSize(state);

    const currentRaw = window.localStorage.getItem(CRM_STORAGE_KEY);
    if (currentRaw !== lastStoredRaw) {
      acceptExternal(currentRaw);
      throw new Error('The CRM changed in another tab. The latest data has been loaded; review it and try your change again.');
    }

    if (unreadableRaw !== null) {
      // Preserve invalid data before a deliberate import/reset or subsequent edit replaces it.
      const recoveryKey = `${CRM_STORAGE_KEY}-recovery-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      window.localStorage.setItem(recoveryKey, unreadableRaw);
      unreadableRaw = null;
    }
    // Persist first: a quota/security failure must not look like a successful edit.
    window.localStorage.setItem(CRM_STORAGE_KEY, serialized);
    lastStoredRaw = serialized;
    publish({ state, error: null });
  } catch (error) {
    const detail = error instanceof DOMException && (error.name === 'QuotaExceededError' || error.name === 'SecurityError')
      ? 'Browser storage is unavailable or full. Your change was not saved. Export a backup, enable storage or free some space, then try again.'
      : message(error);
    publish({ ...snapshot, error: detail });
    throw new Error(detail);
  }
}

function getSnapshot() {
  return snapshot;
}

function getServerSnapshot() {
  return serverSnapshot;
}

export function useCrmStore(): {
  state: CRMState | null;
  save: (state: CRMState) => void;
  error: string | null;
} {
  const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { ...current, save };
}
