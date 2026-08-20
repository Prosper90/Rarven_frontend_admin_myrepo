const KEY       = 'rarven_admin_token';
const ADMIN_KEY = 'rarven_admin_info';

export interface StoredAdminInfo {
  id:   string;
  name: string;
  role: string;
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(KEY);
  localStorage.removeItem(ADMIN_KEY);
}

export function getAdminInfo(): StoredAdminInfo | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(ADMIN_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function setAdminInfo(info: StoredAdminInfo): void {
  localStorage.setItem(ADMIN_KEY, JSON.stringify(info));
}

export function isLoggedIn(): boolean {
  return !!getToken();
}
