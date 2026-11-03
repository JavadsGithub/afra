<script lang="ts">
    import "../app.css";
    import DashboardLayout from "../lib/components/Dashboard/DashboardLayout.svelte";
    import LoginPage from "../lib/components/Auth/LoginPage.svelte";
    import { authStore, initAuth, checkPasswordAge } from "$lib/stores/auth";
    import { settings, isPortConnected } from "$lib/stores/settings";
    import { getPortInfo } from "$lib/services/serial";
    import { startPolling, stopPolling } from "$lib/stores/telemetry";
    import { onMount } from "svelte";

    let { children } = $props();

    onMount(async () => {
        await initAuth();
        try {
            const info = await getPortInfo();
            settings.update((prev) => ({
                ...prev,
                port: info.port_name,
                baud_rate: info.baud_rate,
            }));
        } catch {
            // Backend port info not available; keep defaults
        }
    });

    let prevAuth = $state(false);

    $effect(() => {
        const isAuth = $authStore.is_authenticated;
        const hasPw = $authStore.has_password;

        if (isAuth && hasPw && isAuth !== prevAuth) {
            prevAuth = isAuth;
            checkPasswordAge();
        }

        if (!isAuth) {
            prevAuth = false;
        }
    });

    $effect(() => {
        if ($isPortConnected) {
            startPolling();
        } else {
            stopPolling();
        }
    });
</script>

{#if !$authStore.initialized}
    <div class="flex min-h-screen items-center justify-center">
        <span class="loading loading-spinner loading-lg"></span>
    </div>
{:else if !$authStore.is_authenticated}
    <LoginPage />
{:else}
    <DashboardLayout>
        {@render children()}
    </DashboardLayout>
{/if}
