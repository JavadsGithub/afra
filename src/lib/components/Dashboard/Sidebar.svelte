<script lang="ts">
  import { sendStartMission, sendStopMission } from "$lib/services/receiver";
  import { navigationStore, setActiveNav } from "$lib/stores/navigation";
  import {
    notificationModalVisible,
    notificationStore,
  } from "$lib/stores/notifications";
  import {
    connectToPort,
    disconnectFromPort,
    isPortConnected,
    updateMode,
  } from "$lib/stores/settings";
  import { Bell, Settings, Flag, Ban, Plug, Unplug } from "lucide-svelte";
  import Navigation from "./Navigation.svelte";
  import SidebarFooter from "./SidebarFooter.svelte";
  import SidebarHeader from "./SidebarHeader.svelte";

  let sidebarTransitioning = $state(false);
  let isSendingMission = $state(false);

  export const toggleSidebar = () => {
    sidebarTransitioning = true;
    navigationStore.update((state) => ({
      ...state,
      sidebarCollapsed: !state.sidebarCollapsed,
    }));

    setTimeout(() => {
      sidebarTransitioning = false;
    }, 300);
  };

  async function handlePortConnection() {
    if ($isPortConnected) {
      await disconnectFromPort();
    } else {
      await connectToPort();
    }
  }

  async function handleStartMission() {
    if (!$isPortConnected) {
      notificationStore.add("warning", "عدم اتصال", "ابتدا به پورت متصل شوید");
      return;
    }
    isSendingMission = true;
    try {
      await sendStartMission();
      updateMode("sending");
      notificationStore.add("success", "موفق", "ماموریت با موفقیت شروع شد");
    } catch (e) {
      console.error("Failed to send start mission:", e);
      notificationStore.add("error", "خطا", "ارسال دستور شروع ماموریت ناموفق بود");
    } finally {
      isSendingMission = false;
    }
  }

  async function handleStopMission() {
    if (!$isPortConnected) {
      notificationStore.add("warning", "عدم اتصال", "ابتدا به پورت متصل شوید");
      return;
    }
    isSendingMission = true;
    try {
      await sendStopMission();
      updateMode("idle");
      notificationStore.add("success", "موفق", "ماموریت با موفقیت متوقف شد");
    } catch (e) {
      console.error("Failed to send stop mission:", e);
      notificationStore.add("error", "خطا", "ارسال دستور توقف ماموریت ناموفق بود");
    } finally {
      isSendingMission = false;
    }
  }

</script>

<aside
  class={`sticky top-0 h-screen transition-all duration-300 ease-in-out ${
    $navigationStore.sidebarCollapsed ? "w-16" : "w-64"
  }`}
>
  <div
    class="flex h-full flex-col border-r rtl:border-l border-black/10 bg-base-100"
  >
    <SidebarHeader {sidebarTransitioning} {toggleSidebar} />

    <Navigation {sidebarTransitioning} />

    <!-- Portal container for page-specific sections -->
    <div class="overflow-y-auto">
      {#if $navigationStore.activeNav.id === "map"}
        <div class="border-t border-black/10 px-2 py-3">
          {#if $navigationStore.sidebarCollapsed}
            <div class="flex flex-col items-center gap-1">
              <button
                class="btn btn-ghost btn-square"
                disabled={!$isPortConnected || isSendingMission}
                onclick={handleStartMission}
                title="شروع ماموریت"
              >
                {#if isSendingMission}
                  <span class="loading loading-spinner loading-sm text-primary"></span>
                {:else}
                  <Flag class="h-4 w-4 text-primary" />
                {/if}
              </button>
              <button
                class="btn btn-ghost btn-square"
                disabled={!$isPortConnected || isSendingMission}
                onclick={handleStopMission}
                title="توقف ماموریت"
              >
                {#if isSendingMission}
                  <span class="loading loading-spinner loading-sm text-error"></span>
                {:else}
                  <Ban class="h-4 w-4 text-error" />
                {/if}
              </button>
            </div>
          {:else}
            <div class="px-2">
              <p
                class="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500"
              >
                عملیات
              </p>
              <div class="flex flex-col gap-1">
                <button
                  class="btn {$isPortConnected
                    ? 'btn-error'
                    : 'btn-primary'} btn-sm w-full"
                  onclick={handlePortConnection}
                >
                  {#if $isPortConnected}
                    <Unplug class="h-4 w-4" />
                    قطع اتصال پورت
                  {:else}
                    <Plug class="h-4 w-4" />
                    اتصال پورت
                  {/if}
                </button>
                <button
                  class="btn btn-success btn-sm w-full"
                  disabled={!$isPortConnected || isSendingMission}
                  onclick={handleStartMission}
                >
                  {#if isSendingMission}
                    <span class="loading loading-spinner loading-sm"></span>
                  {:else}
                    <Flag class="h-4 w-4" />
                  {/if}
                  شروع ماموریت
                </button>
                <button
                  class="btn btn-warning btn-sm w-full"
                  disabled={!$isPortConnected || isSendingMission}
                  onclick={handleStopMission}
                >
                  {#if isSendingMission}
                    <span class="loading loading-spinner loading-sm"></span>
                  {:else}
                    <Ban class="h-4 w-4" />
                  {/if}
                  توقف ماموریت
                </button>
              </div>
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <!-- Settings section -->
    <div class="border-t border-black/10 px-2 py-3">
      {#if $navigationStore.sidebarCollapsed}
        <div class="flex flex-col items-center gap-1">
          <button
            class="btn btn-ghost btn-square relative"
            class:btn-secondary={$navigationStore.activeNav.id === "settings"}
            onclick={() =>
              setActiveNav({ id: "settings", label: "تنظیمات", group: "" })}
            title="تنظیمات"
          >
            <Settings class="h-4 w-4" />
          </button>
          <button
            class="btn btn-ghost btn-square relative"
            onclick={() => notificationModalVisible.set(true)}
            title="اعلان‌ها"
          >
            <Bell class="h-4 w-4" />
            {#if $notificationStore.unreadCount > 0}
              <span
                class="absolute -left-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-error px-1 text-[10px] font-bold text-white"
              >
                {$notificationStore.unreadCount > 99
                  ? "99+"
                  : $notificationStore.unreadCount}
              </span>
            {/if}
          </button>
        </div>
      {:else}
        <div class="px-2">
          <div class="flex flex-col gap-1">
            <button
              class="btn btn-ghost btn-sm w-full justify-start gap-2"
              class:btn-secondary={$navigationStore.activeNav.id === "settings"}
              onclick={() =>
                setActiveNav({ id: "settings", label: "تنظیمات", group: "" })}
            >
              <Settings class="h-4 w-4" />
              <span>تنظیمات</span>
            </button>
            <button
              class="btn btn-ghost btn-sm w-full justify-start gap-2 relative"
              onclick={() => notificationModalVisible.set(true)}
            >
              <Bell class="h-4 w-4" />
              <span>اعلان‌ها</span>
              {#if $notificationStore.unreadCount > 0}
                <span
                  class="flex h-5 min-w-5 items-center justify-center rounded-full bg-error px-1.5 text-[10px] font-bold text-white"
                >
                  {$notificationStore.unreadCount > 99
                    ? "99+"
                    : $notificationStore.unreadCount}
                </span>
              {/if}
            </button>
          </div>
        </div>
      {/if}
    </div>

    <SidebarFooter />
  </div>
</aside>
