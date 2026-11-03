import { writable } from "svelte/store";
import { changePassword, getAuthState, getPasswordAgeInfo, login, logout, setPassword } from "$lib/services/auth";
import { notificationStore } from "./notifications";

interface AuthStoreState {
  is_authenticated: boolean;
  has_password: boolean;
  initialized: boolean;
}

export const authStore = writable<AuthStoreState>({
  is_authenticated: false,
  has_password: false,
  initialized: false,
});

export async function checkPasswordAge() {
  try {
    const ageInfo = await getPasswordAgeInfo();
    if (ageInfo.is_expired) {
      const days = ageInfo.days_since_change ?? 0;
      notificationStore.add(
        "warning",
        "تمدید رمز عبور",
        `آخرین تغییر رمز عبور ${days} روز پیش بوده است. برای امنیت بیشتر، رمز عبور خود را تغییر دهید.`,
        0,
      );
    }
  } catch {
    // ignore
  }
}

export async function initAuth() {
  try {
    const state = await getAuthState();
    authStore.set({
      is_authenticated: state.is_authenticated,
      has_password: state.has_password,
      initialized: true,
    });
  } catch {
    authStore.set({
      is_authenticated: false,
      has_password: false,
      initialized: true,
    });
  }
}

export async function handleLogin(password: string): Promise<boolean> {
  const success = await login(password);
  if (success) {
    authStore.update((state) => ({
      ...state,
      is_authenticated: true,
    }));
  }
  return success;
}

export async function handleSetPassword(password: string): Promise<void> {
  await setPassword(password);
  authStore.update((state) => ({
    ...state,
    has_password: true,
    is_authenticated: true,
  }));
}

export async function handleChangePassword(oldPassword: string, newPassword: string): Promise<void> {
  await changePassword(oldPassword, newPassword);
}

export async function handleLogout(): Promise<void> {
  await logout();
  authStore.update((state) => ({
    ...state,
    is_authenticated: false,
  }));
}
