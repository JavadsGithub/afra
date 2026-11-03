<script lang="ts">
  import { notificationStore, notificationModalVisible } from "$lib/stores/notifications";
  import { X, CircleCheck, CircleAlert, Info, TriangleAlert, Trash2 } from "lucide-svelte";

  function formatTime(date: Date): string {
    return date.toLocaleTimeString("fa-IR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function iconForType(type: string) {
    switch (type) {
      case "success":
        return CircleCheck;
      case "warning":
        return TriangleAlert;
      case "error":
        return CircleAlert;
      default:
        return Info;
    }
  }

  function bgForType(type: string): string {
    switch (type) {
      case "success": return "alert-success";
      case "warning": return "alert-warning";
      case "error": return "alert-error";
      default: return "alert-info";
    }
  }

  function close() {
    notificationModalVisible.set(false);
  }
</script>

{#if $notificationModalVisible}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4"
    role="presentation"
    onclick={close}
  >
    <div
      class="w-full max-w-lg rounded-box border border-black/10 bg-base-100 shadow-xl"
      role="dialog"
      tabindex="0"
      onclick={(e) => e.stopPropagation()}
    >
      <div class="flex items-center justify-between border-b border-black/10 px-4 py-3">
        <h3 class="font-semibold text-sm">اعلان‌ها</h3>
        <div class="flex gap-2">
          <button
            class="btn btn-ghost btn-xs"
            onclick={() => notificationStore.markAllRead()}
          >
            خواندن همه
          </button>
          <button
            class="btn btn-ghost btn-xs btn-square"
            onclick={() => notificationStore.clearAll()}
            title="پاک کردن همه"
          >
            <Trash2 class="h-4 w-4" />
          </button>
          <button
            class="btn btn-ghost btn-xs btn-square"
            onclick={close}
            title="بستن"
          >
            <X class="h-4 w-4" />
          </button>
        </div>
      </div>

      <div class="max-h-96 overflow-y-auto">
        {#if $notificationStore.notifications.length === 0}
          <div class="flex flex-col items-center justify-center py-12 text-gray-400">
            <Info class="h-8 w-8 mb-2" />
            <span class="text-sm">هیچ اعلانی وجود ندارد</span>
          </div>
        {:else}
          {#each $notificationStore.notifications as notif (notif.id)}
            <button
              class="flex w-full items-start gap-3 border-b border-black/5 px-4 py-3 text-right transition-colors hover:bg-base-200"
              class:opacity-50={notif.dismissed}
              onclick={() => notificationStore.dismiss(notif.id)}
            >
              <div class="mt-0.5">
                {#if notif.type === "success"}
                  <CircleCheck class="h-5 w-5 text-success" />
                {:else if notif.type === "warning"}
                  <TriangleAlert class="h-5 w-5 text-warning" />
                {:else if notif.type === "error"}
                  <CircleAlert class="h-5 w-5 text-error" />
                {:else}
                  <Info class="h-5 w-5 text-info" />
                {/if}
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium truncate">{notif.title}</p>
                <p class="text-xs text-gray-500 mt-0.5 line-clamp-2">{notif.message}</p>
                <p class="text-xs text-gray-400 mt-1">{formatTime(notif.timestamp)}</p>
              </div>
              <span
                class="flex items-center justify-center shrink-0 w-6 h-6 rounded hover:bg-base-300 cursor-pointer"
                role="button"
                tabindex="0"
                onclick={(e) => { e.stopPropagation(); notificationStore.remove(notif.id); }}
                onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); notificationStore.remove(notif.id); } }}
              >
                <X class="h-3 w-3" />
              </span>
            </button>
          {/each}
        {/if}
      </div>
    </div>
  </div>
{/if}
