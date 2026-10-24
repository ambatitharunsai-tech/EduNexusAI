// EduNexus AI — frontend auth utilities

import { DEMO_BEARER_TOKEN, getAuthToken, isDemoToken, setAuthToken } from './api';
import { safeStorageGet, safeStorageRemove, safeStorageSet } from './utils';

export type AuthRole = 'student' | 'advisor' | 'admin' | 'faculty' | 'staff' | 'evaluator' | 'auditor' | 'viewer' | string;

export interface AuthSession {
  token: string;
  userId: string;
  email: string;
  role: AuthRole;
  isDemoSession: boolean;
}

const STORAGE_KEY = 'edunexus_auth_session';

function safeJsonParse<T>(value: string | null): T | null {
  if (!value) return null;

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return null;

    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const json = decodeURIComponent(
      atob(padded)
        .split('')
        .map((char) => `%${`00${char.charCodeAt(0).toString(16)}`.slice(-2)}`)
        .join('')
    );

    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function isStaffRole(role?: string): boolean {
  const normalized = role?.toLowerCase() ?? '';

  return [
    'admin',
    'administrator',
    'advisor',
    'counselor',
    'faculty',
    'staff',
    'evaluator',
    'evaluator_role',
    'viewer',
    'auditor',
    'data_operator',
  ].includes(normalized);
}

export function normalizeAuthSession(token: string, overrides?: Partial<AuthSession>): AuthSession {
  const payload = decodeJwtPayload(token) ?? {};
  const role = (overrides?.role ?? (typeof payload.app_metadata === 'object' && payload.app_metadata ? String((payload.app_metadata as Record<string, unknown>).role ?? 'student') : 'student')) as AuthRole;

  const session: AuthSession = {
    token,
    userId: String(overrides?.userId ?? payload.sub ?? payload.user_id ?? 'anonymous-user'),
    email: String(overrides?.email ?? payload.email ?? 'unknown@edunexus.ai'),
    role,
    isDemoSession: overrides?.isDemoSession ?? isDemoToken(token),
  };

  return session;
}

export function getStoredAuthSession(): AuthSession | null {
  const raw = safeJsonParse<AuthSession>(safeStorageGet(STORAGE_KEY));

  if (raw?.token) {
    // Purge stale demo tokens if running in production so they never trigger a 401
    if (import.meta.env.PROD && isDemoToken(raw.token)) {
      safeStorageRemove(STORAGE_KEY);
      setAuthToken('');
    } else {
      return raw;
    }
  }

  const token = getAuthToken();
  if (!token) {
    // In production public direct-access mode, return a read-only public advisor workspace session
    // with an empty token so no demo Bearer token is sent over the network.
    return {
      token: '',
      userId: 'public-workspace',
      email: 'advisor@edunexus.ai',
      role: 'advisor',
      isDemoSession: true,
    };
  }
  return normalizeAuthSession(token, {
    token,
    role: 'advisor',
    email: 'advisor@edunexus.ai',
    isDemoSession: true,
  });
}

export function saveAuthSession(session: AuthSession): AuthSession {
  const normalized = normalizeAuthSession(session.token, session);
  if (!import.meta.env.PROD || !isDemoToken(normalized.token)) {
    setAuthToken(normalized.token);
  }
  safeStorageSet(STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function clearAuthSession(): void {
  setAuthToken('');
  safeStorageRemove(STORAGE_KEY);
}

export function signInWithToken(token: string, userOverrides?: Partial<AuthSession>): AuthSession {
  const session = normalizeAuthSession(token, userOverrides);
  return saveAuthSession(session);
}

export function getAuthHeaders(): Record<string, string> {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export { DEMO_BEARER_TOKEN };
