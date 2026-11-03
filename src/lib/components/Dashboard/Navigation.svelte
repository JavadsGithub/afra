<script lang="ts">
    import Icon from "$lib/components/Icon.svelte";
    import {
        navigationStore,
        navItems,
        setActiveNav,
    } from "$lib/stores/navigation";

    interface Props {
        sidebarTransitioning: boolean;
    }

    let { sidebarTransitioning }: Props = $props();

    const getIconName = (id: string) => {
        switch (id) {
            case "dashboard":
                return "dashboard";
            case "map":
                return "map";
            case "waypoints":
                return "waypoints";
            case "telemetry":
                return "telemetry";
            case "settings":
                return "settings";
            default:
                return "";
        }
    };
</script>

<nav class="flex-1 overflow-y-auto p-2 space-y-1">
    {#each navItems as item}
        <button
            class={`btn w-full ${
                $navigationStore.activeNav.id === item.id
                    ? "btn-secondary"
                    : "btn-ghost"
            } ${$navigationStore.sidebarCollapsed ? "btn-square justify-center" : "justify-start"}`}
            title={item.label}
            onclick={() => setActiveNav(item)}
        >
            <Icon
                name={getIconName(item.id)}
                class={`h-4 w-4 transition-opacity duration-300 ${
                    sidebarTransitioning && $navigationStore.sidebarCollapsed
                        ? "opacity-0 mr-2"
                        : "opacity-100"
                }`}
            />
            {#if !$navigationStore.sidebarCollapsed}
                <span
                    class={`transition-opacity duration-300 ${
                        sidebarTransitioning &&
                        $navigationStore.sidebarCollapsed
                            ? "opacity-0"
                            : "opacity-100"
                    }`}
                >
                    {item.label}
                </span>
            {/if}
        </button>
    {/each}
</nav>
