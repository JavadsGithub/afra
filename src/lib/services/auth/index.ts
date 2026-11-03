import { invoke } from '@tauri-apps/api/core';

export interface AuthState {
  is_authenticated: boolean;
  has_password: boolean;
}

export interface PasswordAgeInfo {
  last_changed_at: number | null;
  days_since_change: number | null;
  interval_days: number;
  is_expired: boolean;
}

export async function getAuthState(): Promise<AuthState> {
  return await invoke<AuthState>('get_auth_state');
}

export async function setPassword(password: string): Promise<void> {
  return await invoke<void>('set_password', { password });
}

export async function login(password: string): Promise<boolean> {
  return await invoke<boolean>('login', { password });
}

export async function logout(): Promise<void> {
  return await invoke<void>('logout');
}

export async function changePassword(oldPassword: string, newPassword: string): Promise<void> {
  return await invoke<void>('change_password', { oldPassword, newPassword });
}

export async function getPasswordAgeInfo(): Promise<PasswordAgeInfo> {
  return await invoke<PasswordAgeInfo>('get_password_age_info');
}

export async function setPasswordChangeInterval(days: number): Promise<void> {
  return await invoke<void>('set_password_change_interval', { days });
}

export async function isAuthenticated(): Promise<boolean> {
  return await invoke<boolean>('is_authenticated');
}
