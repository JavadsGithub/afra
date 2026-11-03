<script lang="ts">
    import Sidebar from "./Sidebar.svelte";
    import NotificationPanel from "$lib/components/Notifications/NotificationPanel.svelte";
    import Toast from "$lib/components/Notifications/Toast.svelte";
    import {
        initializeRtlFromPreferences,
        setRtlContext,
    } from "$lib/contexts/rtl-context";
    import { onMount } from "svelte";
    import { listen } from "@tauri-apps/api/event";
    import { notificationStore } from "$lib/stores/notifications";

    const { children } = $props();

    const { direction, isRtl } = setRtlContext();

    $effect(() => {
        const htmlLang = document.documentElement.lang;
        const isRtlLanguage = [
            "ar", "fa", "he", "ur", "ps", "sd", "ug", "ku", "dv", "ha",
        ].includes(htmlLang);

        if (isRtlLanguage) {
            direction.set("rtl");
        } else {
            const initialDir = initializeRtlFromPreferences();
            direction.set(initialDir);
        }
    });

    onMount(() => {
        const unlistenPromises: Promise<() => void>[] = [];

        unlistenPromises.push(
            listen<{ level: string; message: string }>("command-log", (event) => {
                const { level, message } = event.payload;
                const type = level === "error" ? "error"
                    : level === "warn" || level === "warning" ? "warning"
                    : "info";
                const title = type === "error" ? "خطا"
                    : type === "warning" ? "هشدار"
                    : "پیام سیستم";
                notificationStore.add(type, title, message, 6000);
            }),
        );

        unlistenPromises.push(
            listen("robot-data-received", () => {
                notificationStore.add("info", "داده دریافتی", "داده جدید از ربات دریافت شد", 4000);
            }),
        );

        unlistenPromises.push(
            listen<string>("robot-data-error", (event) => {
                notificationStore.add("error", "خطای ارتباط", event.payload, 8000);
            }),
        );

        unlistenPromises.push(
            listen<string>("serial-error", (event) => {
                notificationStore.add("error", "خطای پورت سریال", event.payload, 0);
            }),
        );

        return () => {
            for (const unlisten of unlistenPromises) {
                unlisten.then((fn) => fn());
            }
        };
    });
</script>

<div class="flex h-screen bg-base-100 overflow-hidden">
    <Sidebar />

    <div class="flex flex-1 flex-col">
        <main class="flex-1 overflow-y-auto">
            {@render children()}
        </main>
    </div>
</div>

<Toast />
<NotificationPanel />
