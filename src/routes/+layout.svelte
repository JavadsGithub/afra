<script lang="ts">
    import "../app.css";
    import DashboardLayout from "../lib/components/Dashboard/DashboardLayout.svelte";
    import LoginPage from "../lib/components/Auth/LoginPage.svelte";
    import SplashScreen from "../lib/components/SplashScreen.svelte";
    import { authStore, initAuth, checkPasswordAge } from "$lib/stores/auth";
    import { settings, isPortConnected } from "$lib/stores/settings";
    import { getPortInfo } from "$lib/services/serial";
    import { startPolling, stopPolling } from "$lib/stores/telemetry";
    import { onMount } from "svelte";

    let { children } = $props();
    let isInitializing = $state(true);

    onMount(async () => {
        document.getElementById("app-bootstrap-splash")?.remove();
        try {
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
        } finally {
            isInitializing = false;
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

{#if isInitializing || !$authStore.initialized}
    <SplashScreen />
{:else if !$authStore.is_authenticated}
    <LoginPage />
{:else}
    <DashboardLayout>
        {@render children()}
    </DashboardLayout>
{/if}
