import { writable } from "svelte/store";

export type NotificationType = "info" | "success" | "warning" | "error";

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: Date;
  dismissed: boolean;
  timeoutId?: number;
}

export interface NotificationStoreState {
  notifications: Notification[];
  unreadCount: number;
}

function createNotificationStore() {
  const { subscribe, update } = writable<NotificationStoreState>({
    notifications: [],
    unreadCount: 0,
  });

  let counter = 0;

  function add(
    type: NotificationType,
    title: string,
    message: string,
    durationMs: number = 5000,
  ): string {
    const id = `notif_${Date.now()}_${counter++}`;
    const notification: Notification = {
      id,
      type,
      title,
      message,
      timestamp: new Date(),
      dismissed: false,
    };

    if (durationMs > 0) {
      notification.timeoutId = window.setTimeout(() => {
        dismiss(id);
      }, durationMs);
    }

    update((state) => ({
      notifications: [notification, ...state.notifications],
      unreadCount: state.unreadCount + 1,
    }));

    return id;
  }

  function dismiss(id: string) {
    update((state) => {
      const notif = state.notifications.find((n) => n.id === id);
      if (!notif || notif.dismissed) return state;

      if (notif.timeoutId) {
        clearTimeout(notif.timeoutId);
      }

      notif.dismissed = true;

      return {
        notifications: state.notifications,
        unreadCount: Math.max(0, state.unreadCount - 1),
      };
    });
  }

  function markAllRead() {
    update((state) => {
      for (const notif of state.notifications) {
        if (notif.timeoutId) {
          clearTimeout(notif.timeoutId);
        }
        notif.dismissed = true;
      }
      return {
        notifications: state.notifications,
        unreadCount: 0,
      };
    });
  }

  function clearDismissed() {
    update((state) => ({
      notifications: state.notifications.filter((n) => !n.dismissed),
      unreadCount: state.unreadCount,
    }));
  }

  function remove(id: string) {
    update((state) => {
      const notif = state.notifications.find((n) => n.id === id);
      if (notif?.timeoutId) {
        clearTimeout(notif.timeoutId);
      }
      return {
        notifications: state.notifications.filter((n) => n.id !== id),
        unreadCount: notif?.dismissed
          ? state.unreadCount
          : Math.max(0, state.unreadCount - (notif ? 1 : 0)),
      };
    });
  }

  function clearAll() {
    update((state) => {
      for (const notif of state.notifications) {
        if (notif.timeoutId) {
          clearTimeout(notif.timeoutId);
        }
      }
      return { notifications: [], unreadCount: 0 };
    });
  }

  return { subscribe, add, dismiss, markAllRead, clearDismissed, remove, clearAll };
}

export const notificationStore = createNotificationStore();

export const notificationModalVisible = writable(false);
