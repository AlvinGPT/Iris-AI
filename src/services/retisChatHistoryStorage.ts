import { ChatMessage, RetisChatSession } from '../types';

const CHAT_HISTORY_STORAGE_KEY = 'iris_retis_chat_history_v1';
const HISTORY_PANEL_OPEN_KEY = 'iris_retis_history_panel_open_v1';
export const RETIS_CHAT_RETENTION_DAYS = 30;
export const RETIS_CHAT_RETENTION_MS = RETIS_CHAT_RETENTION_DAYS * 24 * 60 * 60 * 1000;
const MAX_SAVED_CHATS = 100;

export type HistoryDateGroup = 'Today' | 'Yesterday' | 'Previous 7 days' | 'Older';

export interface GroupedChatHistory {
  group: HistoryDateGroup;
  chats: RetisChatSession[];
}

export function deriveChatTitleFromMessage(rawText: string): string {
  const cleaned = rawText.replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'Screen habits report';
  if (cleaned.length <= 40) return cleaned;
  const sliced = cleaned.slice(0, 40).trim();
  return `${sliced}…`;
}

function redactPersonalName(text: string, personalName?: string): string {
  if (!personalName || !text) return text;
  const trimmed = personalName.trim();
  if (!trimmed || trimmed.length < 2) return text;
  const parts = trimmed.split(/\s+/).filter((p) => p.length >= 2);
  let result = text;
  for (const part of [trimmed, ...parts]) {
    const escaped = part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), 'User');
  }
  return result;
}

function sanitizeMessageForStorage(msg: ChatMessage, personalName?: string): ChatMessage {
  const { isFreshReply: _ignoreFresh, ...rest } = msg;
  return {
    ...rest,
    content: redactPersonalName(rest.content, personalName),
    createdAt: rest.createdAt || new Date().toISOString(),
    structured: rest.structured
      ? {
          ...rest.structured,
          answer: redactPersonalName(rest.structured.answer, personalName),
          answerTemplate: redactPersonalName(rest.structured.answerTemplate, personalName),
        }
      : undefined,
  };
}

function pruneExpiredSessions(sessions: RetisChatSession[]): RetisChatSession[] {
  const cutoffMs = Date.now() - RETIS_CHAT_RETENTION_MS;
  return sessions
    .filter((s) => {
      if (!s || typeof s.id !== 'string' || !Array.isArray(s.messages)) return false;
      const updatedMs = Date.parse(s.updatedAt || s.createdAt || '');
      if (!Number.isNaN(updatedMs) && updatedMs < cutoffMs) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      const aMs = Date.parse(a.updatedAt || a.createdAt || '') || 0;
      const bMs = Date.parse(b.updatedAt || b.createdAt || '') || 0;
      return bMs - aMs;
    })
    .slice(0, MAX_SAVED_CHATS);
}

export const RetisChatHistoryStorage = {
  loadSessions(): { sessions: RetisChatSession[]; storageAvailable: boolean } {
    if (typeof window === 'undefined') {
      return { sessions: [], storageAvailable: true };
    }
    try {
      const raw = localStorage.getItem(CHAT_HISTORY_STORAGE_KEY);
      if (!raw) {
        return { sessions: [], storageAvailable: true };
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return { sessions: [], storageAvailable: true };
      }
      const pruned = pruneExpiredSessions(parsed);
      if (pruned.length !== parsed.length) {
        localStorage.setItem(CHAT_HISTORY_STORAGE_KEY, JSON.stringify(pruned));
      }
      return { sessions: pruned, storageAvailable: true };
    } catch {
      return { sessions: [], storageAvailable: false };
    }
  },

  saveSessions(
    sessions: RetisChatSession[],
    personalName?: string
  ): { sessions: RetisChatSession[]; storageAvailable: boolean } {
    const sanitized = pruneExpiredSessions(
      sessions.map((s) => ({
        ...s,
        title: redactPersonalName(s.title, personalName),
        messages: s.messages.map((m) => sanitizeMessageForStorage(m, personalName)),
      }))
    );
    if (typeof window === 'undefined') {
      return { sessions: sanitized, storageAvailable: true };
    }
    try {
      localStorage.setItem(CHAT_HISTORY_STORAGE_KEY, JSON.stringify(sanitized));
      return { sessions: sanitized, storageAvailable: true };
    } catch {
      return { sessions: sanitized, storageAvailable: false };
    }
  },

  upsertSession(
    existingSessions: RetisChatSession[],
    session: RetisChatSession,
    personalName?: string
  ): { sessions: RetisChatSession[]; storageAvailable: boolean } {
    const filtered = existingSessions.filter((s) => s.id !== session.id);
    const next = [session, ...filtered];
    return this.saveSessions(next, personalName);
  },

  renameSession(
    existingSessions: RetisChatSession[],
    sessionId: string,
    newTitle: string,
    personalName?: string
  ): { sessions: RetisChatSession[]; storageAvailable: boolean } {
    const trimmed = newTitle.replace(/\s+/g, ' ').trim();
    if (!trimmed) {
      return { sessions: existingSessions, storageAvailable: true };
    }
    const next = existingSessions.map((s) =>
      s.id === sessionId ? { ...s, title: trimmed } : s
    );
    return this.saveSessions(next, personalName);
  },

  deleteSession(
    existingSessions: RetisChatSession[],
    sessionId: string,
    personalName?: string
  ): { sessions: RetisChatSession[]; storageAvailable: boolean } {
    const next = existingSessions.filter((s) => s.id !== sessionId);
    return this.saveSessions(next, personalName);
  },

  clearAllSessions(): { sessions: RetisChatSession[]; storageAvailable: boolean } {
    if (typeof window === 'undefined') {
      return { sessions: [], storageAvailable: true };
    }
    try {
      localStorage.removeItem(CHAT_HISTORY_STORAGE_KEY);
      return { sessions: [], storageAvailable: true };
    } catch {
      return { sessions: [], storageAvailable: false };
    }
  },

  loadPanelOpenState(defaultOpen: boolean): boolean {
    if (typeof window === 'undefined') return defaultOpen;
    try {
      const stored = localStorage.getItem(HISTORY_PANEL_OPEN_KEY);
      if (stored === 'true') return true;
      if (stored === 'false') return false;
      return defaultOpen;
    } catch {
      return defaultOpen;
    }
  },

  savePanelOpenState(isOpen: boolean): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(HISTORY_PANEL_OPEN_KEY, isOpen ? 'true' : 'false');
    } catch {
      // Ignore storage errors
    }
  },

  groupSessionsByDate(
    sessions: RetisChatSession[],
    searchQuery = ''
  ): GroupedChatHistory[] {
    const q = searchQuery.trim().toLowerCase();
    const filtered = q
      ? sessions.filter((s) => {
          if (s.title.toLowerCase().includes(q)) return true;
          return s.messages.some((m) => m.content.toLowerCase().includes(q));
        })
      : sessions;

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
    const startOfPrev7Days = startOfToday - 7 * 24 * 60 * 60 * 1000;

    const buckets: Record<HistoryDateGroup, RetisChatSession[]> = {
      Today: [],
      Yesterday: [],
      'Previous 7 days': [],
      Older: [],
    };

    for (const chat of filtered) {
      const ts = Date.parse(chat.updatedAt || chat.createdAt || '') || Date.now();
      if (ts >= startOfToday) {
        buckets.Today.push(chat);
      } else if (ts >= startOfYesterday) {
        buckets.Yesterday.push(chat);
      } else if (ts >= startOfPrev7Days) {
        buckets['Previous 7 days'].push(chat);
      } else {
        buckets.Older.push(chat);
      }
    }

    const order: HistoryDateGroup[] = ['Today', 'Yesterday', 'Previous 7 days', 'Older'];
    return order
      .filter((g) => buckets[g].length > 0)
      .map((g) => ({
        group: g,
        chats: buckets[g],
      }));
  },
};
