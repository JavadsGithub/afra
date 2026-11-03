<script lang="ts">
    import { navigationStore } from "$lib/stores/navigation";
    import { handleLogout } from "$lib/stores/auth";
    import { LogOut } from "lucide-svelte";
</script>

<div class="border-t border-black/10 p-2">
    {#if $navigationStore.sidebarCollapsed}
        <button
            type="button"
            class="btn btn-ghost btn-square w-full"
            onclick={handleLogout}
            title="خروج"
            aria-label="خروج"
        >
            <LogOut class="h-4 w-4" />
        </button>
    {:else}
        <button
            type="button"
            class="btn btn-ghost btn-sm w-full justify-start gap-2"
            onclick={handleLogout}
            title="خروج"
        >
            <LogOut class="h-4 w-4" />
            <span>خروج</span>
        </button>
    {/if}
</div>
