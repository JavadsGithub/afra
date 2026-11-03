<script lang="ts">
    import { Bell, LogOut } from "lucide-svelte";
    import { navigationStore } from "$lib/stores/navigation";
    import { handleLogout } from "$lib/stores/auth";
    import { notificationStore, notificationModalVisible } from "$lib/stores/notifications";
</script>

<header
    class="sticky top-0 z-10 min-h-16 border-b border-black/10 bg-base-100"
>
    <div class="flex h-16 items-center justify-between px-4">
        <div class="flex items-center space-x-4">
            <h1
                class="text-lg font-semibold transition-opacity duration-300"
            >
                {$navigationStore.activeNav.label}
            </h1>
        </div>
        <div class="flex items-center space-x-4">
            <div class="relative notification-area">
                <button
                    class="btn btn-ghost btn-square relative transition-opacity duration-300"
                    onclick={() => notificationModalVisible.set(true)}
                >
                    <Bell class="h-5 w-5" />
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
            <button
                class="btn btn-ghost btn-square transition-opacity duration-300"
                onclick={handleLogout}
                title="خروج"
            >
                <LogOut class="h-5 w-5" />
            </button>
        </div>
    </div>
</header>
