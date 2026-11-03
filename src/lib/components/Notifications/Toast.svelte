<script lang="ts">
  import { notificationStore } from "$lib/stores/notifications";
  import { CircleCheck, CircleAlert, Info, TriangleAlert, X } from "lucide-svelte";

  let visible = $state(false);
  let title = $state("");
  let message = $state("");
  let type = $state<"info" | "success" | "warning" | "error">("info");
  let currentId = $state<string | null>(null);
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  function showNotification() {
    const active = $notificationStore.notifications.find((n) => !n.dismissed);
    if (active && active.id !== currentId) {
      currentId = active.id;
      title = active.title;
      message = active.message;
      type = active.type;
      visible = true;

      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        visible = false;
        currentId = null;
      }, 3000);
    }
  }

  $effect(() => {
    $notificationStore.notifications;
    showNotification();
  });

  function dismiss() {
    if (currentId) {
      notificationStore.dismiss(currentId);
    }
    visible = false;
    currentId = null;
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  }

  function iconForType(t: string) {
    switch (t) {
      case "success": return CircleCheck;
      case "warning": return TriangleAlert;
      case "error": return CircleAlert;
      default: return Info;
    }
  }

  function bgForType(t: string): string {
    switch (t) {
      case "success": return "alert-success";
      case "warning": return "alert-warning";
      case "error": return "alert-error";
      default: return "alert-info";
    }
  }
</script>

{#if visible}
  <div
    class="fixed left-1/2 top-4 z-[2000] -translate-x-1/2 transition-all duration-300"
    role="alert"
  >
    <div class="alert {bgForType(type)} flex items-center gap-2 pr-3 shadow-lg">
      {#if type === "success"}
        <CircleCheck class="h-5 w-5 shrink-0" />
      {:else if type === "warning"}
        <TriangleAlert class="h-5 w-5 shrink-0" />
      {:else if type === "error"}
        <CircleAlert class="h-5 w-5 shrink-0" />
      {:else}
        <Info class="h-5 w-5 shrink-0" />
      {/if}
      <div class="flex flex-col">
        <span class="text-sm font-medium">{title}</span>
        <span class="text-xs opacity-80">{message}</span>
      </div>
      <button class="btn btn-ghost btn-xs btn-square ml-2" onclick={dismiss}>
        <X class="h-4 w-4" />
      </button>
    </div>
  </div>
{/if}
