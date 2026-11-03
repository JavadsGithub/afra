<script lang="ts">
    import Icon from "$lib/components/Icon.svelte";
    import { ChevronRight, Menu, X } from "lucide-svelte";
    import { navigationStore } from "$lib/stores/navigation";

    interface Props {
        sidebarTransitioning: boolean;
        toggleSidebar: () => void;
    }

    let { sidebarTransitioning, toggleSidebar }: Props = $props();
</script>

<!-- Sidebar header -->
<div class="flex h-16 items-center justify-between px-4" dir="auto">
    {#if $navigationStore.sidebarCollapsed}
        <button
            class="btn btn-ghost btn-square h-8 w-8"
            onclick={toggleSidebar}
        >
            <Menu class="h-5 w-5" />
        </button>
    {:else}
        <div
            class="w-full h-16 flex justify-between items-center overflow-hidden"
        >
            <div
                class="flex items-center gap-2 rtl:space-x-reverse transition-opacity duration-300"
                class:opacity-0={sidebarTransitioning &&
                    $navigationStore.sidebarCollapsed}
                class:opacity-100={!sidebarTransitioning ||
                    !$navigationStore.sidebarCollapsed}
            >
                <img src="/icon.png" alt="AFRA" class="h-8 w-8 rounded-lg object-cover" />
                <div
                    class="flex flex-col leading-tight transition-opacity duration-300"
                    class:opacity-0={sidebarTransitioning &&
                        $navigationStore.sidebarCollapsed}
                    class:opacity-100={!sidebarTransitioning ||
                        !$navigationStore.sidebarCollapsed}
                >
                    <span class="text-sm font-bold tracking-wide">AFRA</span>
                    <span class="text-[10px] font-medium text-base-content/60">Ground Station</span>
                </div>
            </div>
            <button class="btn btn-ghost btn-square" onclick={toggleSidebar}>
                <ChevronRight class="h-5 w-5" />
            </button>
        </div>
    {/if}
</div>
