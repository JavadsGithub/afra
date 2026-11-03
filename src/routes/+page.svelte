<script lang="ts">
    import { navigationStore } from "$lib/stores/navigation";
    import MapView from "$lib/components/Dashboard/MapView.svelte";
    import TableView from "$lib/components/Dashboard/TableView.svelte";
    import SettingsView from "$lib/components/Dashboard/SettingsView.svelte";
    import Logger from "$lib/components/Dashboard/Logger.svelte";
    import TelemetryManagement from "$lib/components/Dashboard/TelemetryManagement.svelte";
</script>

<div>
    {#if $navigationStore.activeNav.id === "map"}
        <MapView />
    {:else if $navigationStore.activeNav.id === "telemetry"}
        <TelemetryManagement />
    {:else if $navigationStore.activeNav.id === "waypoints"}
        <TableView />
    {:else if $navigationStore.activeNav.id === "settings"}
        <SettingsView />
    {:else}
        <div class="text-center py-10">
            <h2 class="text-2xl font-semibold mb-4">
                {$navigationStore.activeNav.label}
            </h2>
            <p class="text-gray-600">
                محتوای مربوط به این بخش در حال حاضر موجود نیست
            </p>
        </div>
    {/if}
</div>
