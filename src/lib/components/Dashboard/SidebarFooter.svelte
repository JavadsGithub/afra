<script lang="ts">
    import { navigationStore } from "$lib/stores/navigation";
    import { handleLogout } from "$lib/stores/auth";
    import { LogOut } from "lucide-svelte";
</script>

<div class="border-t border-black/10 p-2">
    {#if $navigationStore.sidebarCollapsed}
        <div class="flex flex-col items-center gap-1">
            <button
                class="btn btn-ghost btn-square w-full"
                title="User Profile"
            >
                <div class="h-8 w-8 rounded-full bg-neutral"></div>
            </button>
            <button
                class="btn btn-ghost btn-square w-full"
                onclick={handleLogout}
                title="خروج"
            >
                <LogOut class="h-4 w-4" />
            </button>
        </div>
    {:else}
        <div class="flex items-center justify-between p-2">
            <div class="flex gap-2 items-center space-x-3 rtl:space-x-reverse">
                <div class="h-10 w-10 rounded-full bg-neutral shrink-0"></div>
                <div class="min-w-0">
                    <p class="text-sm font-medium truncate">علی علوی</p>
                    <p class="text-xs text-gray-500 truncate">ali@example.com</p>
                </div>
            </div>
            <button
                class="btn btn-ghost btn-square btn-sm"
                onclick={handleLogout}
                title="خروج"
            >
                <LogOut class="h-4 w-4" />
            </button>
        </div>
    {/if}
</div>
