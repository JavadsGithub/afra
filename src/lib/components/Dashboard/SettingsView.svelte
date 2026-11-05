<script lang="ts">
    import { onMount } from "svelte";
    import {
        settings,
        isPortConnected,
        updateBaudRate,
        updateFrequency,
        updateTxPower,
        updateChannelBandwidth,
        updateSimulationMode,
        updatePort,
        resetSettings,
    } from "$lib/stores/settings";
    import { handleChangePassword } from "$lib/stores/auth";
    import { getPasswordAgeInfo, setPasswordChangeInterval } from "$lib/services/auth";
    import { scanPorts, type PortInfo } from "$lib/services/ports";
    import { exportTelemetries } from "$lib/services/telemetry";
    import { revealItemInDir } from "@tauri-apps/plugin-opener";
    import {
        activateOfflineMap as activateOfflineMapService,
        downloadRegionTiles,
        estimateRegionTileCount,
        inspectOfflineMap,
        loadSavedOfflineMaps,
        offlineMap,
        offlineMaps,
        removeOfflineMap,
        saveOfflineMap,
        type OfflineMapCandidate,
        type OfflineMapInfo,
        type RegionDownloadOptions,
        type RegionDownloadProgress,
    } from "$lib/services/offline-maps";

    // Subscribe to the settings store to get current values
    let currentSettings = $settings;

    onMount(() => {
        loadInterval();
        refreshPorts();
        loadOfflineMapInfo();
    });

    let oldPassword = $state("");
    let newPassword = $state("");
    let confirmNewPassword = $state("");
    let changePasswordError = $state("");
    let changePasswordSuccess = $state("");
    let isChangingPassword = $state(false);

    let alertIntervalDays = $state(30);
    let isIntervalLoading = $state(true);
    let intervalSaveSuccess = $state("");
    let intervalSaveError = $state("");

    let availablePorts = $state<PortInfo[]>([]);
    let isScanningPorts = $state(false);

    let isExporting = $state(false);
    let exportSuccess = $state("");
    let exportError = $state("");
    let exportPath = $state("");
    let exportFormat = $state("csv");

    let offlineMapInput = $state<HTMLInputElement | undefined>(undefined);
    let offlineMapLoading = $state(true);
    let offlineMapError = $state("");
    let offlineMapSuccess = $state("");
    let isInspectingOfflineMap = $state(false);
    let isSavingOfflineMap = $state(false);
    let isActivatingOfflineMap = $state(false);
    let removingMapId = $state<string | null>(null);
    let pendingOfflineMap = $state<OfflineMapCandidate | null>(null);
    let offlineMapAttribution = $state("");
    let offlineMapName = $state("");

    let regionName = $state("");
    let tileUrlTemplate = $state("");
    let regionSouth = $state<number | undefined>(undefined);
    let regionWest = $state<number | undefined>(undefined);
    let regionNorth = $state<number | undefined>(undefined);
    let regionEast = $state<number | undefined>(undefined);
    let regionMinZoom = $state<number | undefined>(undefined);
    let regionMaxZoom = $state<number | undefined>(undefined);
    let regionAttribution = $state("");
    let confirmsOfflinePermission = $state(false);
    let isDownloadingRegion = $state(false);
    let downloadProgress = $state<RegionDownloadProgress | null>(null);
    let regionDownloadController: AbortController | null = null;
    let estimatedRegionTiles = $derived(estimateRegionTileCount({
        south: Number(regionSouth),
        west: Number(regionWest),
        north: Number(regionNorth),
        east: Number(regionEast),
        minZoom: Number(regionMinZoom),
        maxZoom: Number(regionMaxZoom),
    }));

    async function loadOfflineMapInfo() {
        offlineMapLoading = true;
        try {
            await loadSavedOfflineMaps();
        } catch (error) {
            offlineMapError = error instanceof Error
                ? error.message
                : "بارگذاری نقشه آفلاین ناموفق بود";
        } finally {
            offlineMapLoading = false;
        }
    }

    async function handleOfflineMapSelection(event: Event) {
        const input = event.currentTarget as HTMLInputElement;
        const file = input.files?.[0];
        input.value = "";
        if (!file) return;

        offlineMapError = "";
        offlineMapSuccess = "";
        pendingOfflineMap = null;
        offlineMapAttribution = "";
        offlineMapName = "";
        isInspectingOfflineMap = true;
        try {
            pendingOfflineMap = await inspectOfflineMap(file);
            offlineMapAttribution = pendingOfflineMap.info.attribution;
            offlineMapName = pendingOfflineMap.info.name;
        } catch (error) {
            offlineMapError = error instanceof Error
                ? error.message
                : "بررسی بسته نقشه ناموفق بود";
        } finally {
            isInspectingOfflineMap = false;
        }
    }

    async function saveSelectedOfflineMap() {
        if (!pendingOfflineMap || !offlineMapAttribution.trim()) return;

        offlineMapError = "";
        offlineMapSuccess = "";
        isSavingOfflineMap = true;
        try {
            await saveOfflineMap(
                pendingOfflineMap,
                offlineMapAttribution,
                offlineMapName,
            );
            pendingOfflineMap = null;
            offlineMapSuccess = "بسته نقشه روی این دستگاه ذخیره و فعال شد";
        } catch (error) {
            offlineMapError = error instanceof Error
                ? error.message
                : "ذخیره نقشه آفلاین ناموفق بود";
        } finally {
            isSavingOfflineMap = false;
        }
    }

    async function activateMap(id: string) {
        offlineMapError = "";
        isActivatingOfflineMap = true;
        try {
            await activateOfflineMapService(id);
            offlineMapSuccess = "نقشه آفلاین فعال شد";
        } catch (error) {
            offlineMapError = error instanceof Error
                ? error.message
                : "فعال‌سازی نقشه ناموفق بود";
        } finally {
            isActivatingOfflineMap = false;
        }
    }

    async function deleteOfflineMap(id: string) {
        const mapInfo = $offlineMaps.find((item) => item.id === id);
        if (!window.confirm(`بسته «${mapInfo?.name ?? "نقشه آفلاین"}» حذف شود؟`)) return;

        offlineMapError = "";
        offlineMapSuccess = "";
        removingMapId = id;
        try {
            await removeOfflineMap(id);
            offlineMapSuccess = "بسته نقشه حذف شد";
        } catch (error) {
            offlineMapError = error instanceof Error
                ? error.message
                : "حذف نقشه آفلاین ناموفق بود";
        } finally {
            removingMapId = null;
        }
    }

    async function startRegionDownload() {
        offlineMapError = "";
        offlineMapSuccess = "";
        const options: RegionDownloadOptions = {
            name: regionName,
            urlTemplate: tileUrlTemplate,
            south: Number(regionSouth),
            west: Number(regionWest),
            north: Number(regionNorth),
            east: Number(regionEast),
            minZoom: Number(regionMinZoom),
            maxZoom: Number(regionMaxZoom),
            attribution: regionAttribution,
            confirmsOfflinePermission,
        };

        regionDownloadController = new AbortController();
        isDownloadingRegion = true;
        downloadProgress = {
            completed: 0,
            total: estimatedRegionTiles,
            storedTiles: 0,
            downloadedBytes: 0,
        };
        try {
            const downloaded = await downloadRegionTiles(
                options,
                (progress) => (downloadProgress = progress),
                regionDownloadController.signal,
            );
            offlineMapSuccess = `«${downloaded.info.name}» با ${downloaded.info.tileCount.toLocaleString()} کاشی ذخیره و فعال شد`;
        } catch (error) {
            offlineMapError = error instanceof DOMException && error.name === "AbortError"
                ? "دریافت بسته لغو شد و داده‌های ناقص پاک شدند"
                : error instanceof Error
                    ? error.message
                    : "دریافت بسته نقشه ناموفق بود";
        } finally {
            isDownloadingRegion = false;
            regionDownloadController = null;
        }
    }

    function cancelRegionDownload() {
        regionDownloadController?.abort();
    }

    function cancelOfflineMapSelection() {
        pendingOfflineMap = null;
        offlineMapAttribution = "";
        offlineMapName = "";
        offlineMapError = "";
    }

    function formatBytes(bytes: number): string {
        if (bytes < 1024) return `${bytes} B`;
        const units = ["KB", "MB", "GB", "TB"];
        let size = bytes / 1024;
        let unitIndex = 0;
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex += 1;
        }
        return `${size.toFixed(size >= 100 ? 0 : 1)} ${units[unitIndex]}`;
    }

    function tileKindLabel(info: Pick<OfflineMapInfo, "tileKind">): string {
        return info.tileKind === "vector" ? "برداری" : "رستری";
    }

    function formatBounds(info: Pick<OfflineMapInfo, "minLat" | "minLon" | "maxLat" | "maxLon">): string {
        return `${info.minLat.toFixed(2)}, ${info.minLon.toFixed(2)} تا ${info.maxLat.toFixed(2)}, ${info.maxLon.toFixed(2)}`;
    }

    async function handleExportData() {
        exportSuccess = "";
        exportError = "";
        exportPath = "";
        isExporting = true;
        try {
            const path = await exportTelemetries(null, exportFormat);
            exportPath = path;
            exportSuccess = "داده‌ها با موفقیت ذخیره شد";
        } catch (e: any) {
            exportError = e || "خطا در خروجی گرفتن داده‌ها";
        } finally {
            isExporting = false;
        }
    }

    async function openContainingFolder() {
        if (!exportPath) return;
        try {
            await revealItemInDir(exportPath);
        } catch (e) {
            exportError = "خطا در باز کردن پوشه مقصد";
        }
    }

    async function refreshPorts() {
        isScanningPorts = true;
        try {
            let ports = await scanPorts();
            // Ensure the currently selected/connected port is always in the list
            // (it may be occupied by this app and hide from scan)
            if ($settings.port && !ports.some((p) => p.path === $settings.port)) {
                ports = [{ name: $settings.port, path: $settings.port }, ...ports];
            }
            availablePorts = ports;
            if (availablePorts.length > 0 && !$settings.port) {
                updatePort(availablePorts[0].path);
            }
        } catch {
            availablePorts = $settings.port
                ? [{ name: $settings.port, path: $settings.port }]
                : [];
        } finally {
            isScanningPorts = false;
        }
    }

    let activeTab = $state("communication");

    async function loadInterval() {
        isIntervalLoading = true;
        try {
            const info = await getPasswordAgeInfo();
            alertIntervalDays = info.interval_days;
        } catch {
            // keep default
        } finally {
            isIntervalLoading = false;
        }
    }

    async function saveInterval() {
        intervalSaveSuccess = "";
        intervalSaveError = "";
        if (alertIntervalDays < 1) {
            intervalSaveError = "بازه باید حداقل ۱ روز باشد";
            return;
        }
        try {
            await setPasswordChangeInterval(alertIntervalDays);
            intervalSaveSuccess = "بازه یادآوری با موفقیت ذخیره شد";
        } catch (e: any) {
            intervalSaveError = e || "خطایی رخ داده است";
        }
    }

    async function onChangePassword() {
        changePasswordError = "";
        changePasswordSuccess = "";

        if (!oldPassword) {
            changePasswordError = "رمز عبور فعلی را وارد کنید";
            return;
        }
        if (!newPassword || newPassword.length < 4) {
            changePasswordError = "رمز عبور جدید باید حداقل ۴ کاراکتر باشد";
            return;
        }
        if (newPassword !== confirmNewPassword) {
            changePasswordError = "رمز عبور جدید و تکرار آن مطابقت ندارند";
            return;
        }

        isChangingPassword = true;
        try {
            await handleChangePassword(oldPassword, newPassword);
            changePasswordSuccess = "رمز عبور با موفقیت تغییر یافت";
            oldPassword = "";
            newPassword = "";
            confirmNewPassword = "";
        } catch (e: any) {
            changePasswordError = e || "خطایی رخ داده است";
        } finally {
            isChangingPassword = false;
        }
    }
</script>

<div class="p-6">
    <h1 class="text-3xl font-bold mb-6">تنظیمات</h1>
    <div class="bg-base-100 rounded-lg shadow">
        <div role="tablist" class="tabs tabs-boxed">
            <button
                role="tab"
                class="tab"
                class:tab-active={activeTab === "communication"}
                onclick={() => (activeTab = "communication")}
            >
                پیکربندی ارتباط
            </button>
            <button
                role="tab"
                class="tab"
                class:tab-active={activeTab === "security"}
                onclick={() => (activeTab = "security")}
            >
                امنیت
            </button>
            <button
                role="tab"
                class="tab"
                class:tab-active={activeTab === "data"}
                onclick={() => (activeTab = "data")}
            >
                داده‌ها
            </button>
            <button
                role="tab"
                class="tab"
                class:tab-active={activeTab === "map"}
                onclick={() => (activeTab = "map")}
            >
                نقشه آفلاین
            </button>
        </div>
        <div class="p-6">
            {#if activeTab === "communication"}
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div class="card bg-base-200">
                        <div class="card-body">
                            <h3 class="card-title">پارامترهای اتصال</h3>

                            <div class="form-control">
                                <label class="label" for="port">
                                    <span class="label-text">پورت سریال</span>
                                </label>
                                <div class="flex gap-2 items-center">
                                    <select
                                        id="port"
                                        class="select select-bordered flex-1"
                                        disabled={$isPortConnected}
                                        onchange={(e: any) =>
                                            updatePort(e.target?.value)}
                                    >
                                        {#if availablePorts.length === 0}
                                            <option value="" disabled selected>
                                                {isScanningPorts ? "در حال جستجو..." : "پورتی یافت نشد"}
                                            </option>
                                        {:else}
                                            {#each availablePorts as p}
                                                <option
                                                    value={p.path}
                                                    selected={$settings.port === p.path}
                                                >
                                                    {p.name}
                                                </option>
                                            {/each}
                                        {/if}
                                    </select>
                                    <button
                                        class="btn btn-outline btn-square"
                                        onclick={refreshPorts}
                                        disabled={$isPortConnected || isScanningPorts}
                                    >
                                        {#if isScanningPorts}
                                            <span class="loading loading-spinner loading-sm"></span>
                                        {:else}
                                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>
                                        {/if}
                                    </button>
                                </div>
                            </div>

                            <div class="form-control">
                                <label class="label" for="baud-rate">
                                    <span class="label-text"
                                        >سرعت انتقال (Baud Rate)</span
                                    >
                                </label>
                                <input
                                    id="baud-rate"
                                    type="number"
                                    class="input input-bordered"
                                    bind:value={$settings.baud_rate}
                                    oninput={(e: any) =>
                                        updateBaudRate(Number(e.target?.value))}
                                    min="1"
                                    step="1"
                                />
                            </div>

                            <div class="form-control mt-4">
                                <label class="label" for="frequency">
                                    <span class="label-text">فرکانس (MHz)</span>
                                </label>
                                <input
                                    id="frequency"
                                    type="number"
                                    class="input input-bordered"
                                    bind:value={$settings.frequency_mhz}
                                    oninput={(e: any) =>
                                        updateFrequency(Number(e.target?.value))}
                                    min="0"
                                    step="any"
                                />
                            </div>

                            <div class="form-control mt-4">
                                <label class="label" for="tx-power">
                                    <span class="label-text">توان انتقال (mW)</span>
                                </label>
                                <input
                                    id="tx-power"
                                    type="number"
                                    class="input input-bordered"
                                    bind:value={$settings.tx_power}
                                    oninput={(e: any) =>
                                        updateTxPower(Number(e.target?.value))}
                                    min="1"
                                    step="1"
                                />
                            </div>

                            <div class="form-control mt-4">
                                <label class="label" for="channel-bandwidth">
                                    <span class="label-text"
                                        >پهنای باند کانال (kHz)</span
                                    >
                                </label>
                                <input
                                    id="channel-bandwidth"
                                    type="number"
                                    class="input input-bordered"
                                    bind:value={$settings.channel_bandwidth}
                                    oninput={(e: any) =>
                                        updateChannelBandwidth(
                                            Number(e.target?.value),
                                        )}
                                    min="0"
                                    step="any"
                                />
                            </div>
                        </div>
                    </div>

                    <div class="card bg-base-200">
                        <div class="card-body">
                            <h3 class="card-title">حالت شبیه‌سازی</h3>
                            <div class="form-control">
                                <label class="label cursor-pointer justify-start">
                                    <span class="label-text mr-3"
                                        >فعال‌سازی حالت شبیه‌سازی</span
                                    >
                                    <input
                                        type="checkbox"
                                        class="toggle toggle-primary"
                                        bind:checked={$settings.simulation_mode}
                                        onchange={(e: any) =>
                                            updateSimulationMode(e.target?.checked)}
                                    />
                                </label>
                            </div>

                            <div class="mt-6">
                                <h3 class="text-lg font-semibold mb-3">
                                    تنظیمات پیش‌فرض
                                </h3>
                                <button
                                    class="btn btn-outline w-full"
                                    onclick={() => resetSettings()}
                                >
                                    بازگرداندن به تنظیمات پیش‌فرض
                                </button>
                            </div>

                            <div class="mt-6">
                                <h3 class="text-lg font-semibold mb-3">
                                    اطلاعات فعلی تنظیمات
                                </h3>
                                <div class="text-sm text-gray-600">
                                    <p>پورت: {$settings.port || "تشخیص داده نشد"}</p>
                                    <p>سرعت انتقال: {$settings.baud_rate}</p>
                                    <p>فرکانس: {$settings.frequency_mhz} MHz</p>
                                    <p>توان انتقال: {$settings.tx_power} mW</p>
                                    <p>
                                        پهنای باند: {$settings.channel_bandwidth} kHz
                                    </p>
                                    <p>
                                        حالت شبیه‌سازی: {$settings.simulation_mode
                                            ? "فعال"
                                            : "غیرفعال"}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            {:else if activeTab === "security"}
                <div class="card bg-base-200">
                    <div class="card-body">
                        <h3 class="card-title">تغییر رمز عبور</h3>

                        {#if changePasswordSuccess}
                            <div class="alert alert-success mt-2">
                                <span>{changePasswordSuccess}</span>
                            </div>
                        {/if}

                        {#if changePasswordError}
                            <div class="alert alert-error mt-2">
                                <span>{changePasswordError}</span>
                            </div>
                        {/if}

                        <div class="form-control">
                            <label class="label" for="old-password">
                                <span class="label-text">رمز عبور فعلی</span>
                            </label>
                            <input
                                id="old-password"
                                type="password"
                                class="input input-bordered"
                                bind:value={oldPassword}
                                placeholder="رمز عبور فعلی را وارد کنید"
                            />
                        </div>

                        <div class="form-control mt-4">
                            <label class="label" for="new-password">
                                <span class="label-text">رمز عبور جدید</span>
                            </label>
                            <input
                                id="new-password"
                                type="password"
                                class="input input-bordered"
                                bind:value={newPassword}
                                placeholder="رمز عبور جدید را وارد کنید"
                            />
                        </div>

                        <div class="form-control mt-4">
                            <label class="label" for="confirm-new-password">
                                <span class="label-text">تکرار رمز عبور جدید</span>
                            </label>
                            <input
                                id="confirm-new-password"
                                type="password"
                                class="input input-bordered"
                                bind:value={confirmNewPassword}
                                placeholder="رمز عبور جدید را مجدداً وارد کنید"
                            />
                        </div>

                        <div class="card-actions mt-4">
                            <button
                                class="btn btn-primary w-full"
                                onclick={onChangePassword}
                                disabled={isChangingPassword}
                            >
                                {#if isChangingPassword}
                                    <span class="loading loading-spinner loading-sm"></span>
                                {/if}
                                تغییر رمز عبور
                            </button>
                        </div>

                        <div class="divider mt-6"></div>

                        <h3 class="card-title mt-4">یادآوری تغییر رمز عبور</h3>
                        <p class="text-xs text-gray-500 mt-1">
                            با تنظیم این گزینه، پس از گذشت تعداد روز مشخص شده، اعلانی برای تغییر رمز عبور دریافت خواهید کرد.
                        </p>

                        {#if intervalSaveSuccess}
                            <div class="alert alert-success mt-2">
                                <span>{intervalSaveSuccess}</span>
                            </div>
                        {/if}

                        {#if intervalSaveError}
                            <div class="alert alert-error mt-2">
                                <span>{intervalSaveError}</span>
                            </div>
                        {/if}

                        <div class="form-control mt-4">
                            <label class="label" for="alert-interval">
                                <span class="label-text">بازه یادآوری (روز)</span>
                            </label>
                            <div class="flex gap-2 items-center">
                                <input
                                    id="alert-interval"
                                    type="number"
                                    class="input input-bordered flex-1"
                                    bind:value={alertIntervalDays}
                                    min="1"
                                    step="1"
                                    disabled={isIntervalLoading}
                                />
                                <button
                                    class="btn btn-primary"
                                    onclick={saveInterval}
                                    disabled={isIntervalLoading}
                                >
                                    {#if isIntervalLoading}
                                        <span class="loading loading-spinner loading-sm"></span>
                                    {:else}
                                        ذخیره
                                    {/if}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            {:else if activeTab === "data"}
                <div class="card bg-base-200">
                    <div class="card-body">
                        <h3 class="card-title">خروجی گرفتن از داده‌ها</h3>
                        <p class="text-xs text-gray-500 mt-1">
                            تمام رکوردهای تله‌متری ذخیره‌شده در قالب انتخابی (CSV یا Excel) خروجی گرفته می‌شود.
                        </p>

                        {#if exportSuccess}
                            <div class="alert alert-success mt-2 flex-col items-start gap-2">
                                <span>{exportSuccess}</span>
                                <span class="text-xs break-all opacity-80">{exportPath}</span>
                                <button
                                    class="btn btn-sm btn-outline"
                                    onclick={openContainingFolder}
                                >
                                    باز کردن پوشه مقصد
                                </button>
                            </div>
                        {/if}

                        {#if exportError}
                            <div class="alert alert-error mt-2">
                                <span>{exportError}</span>
                            </div>
                        {/if}

                        <div class="form-control mt-4">
                            <label class="label" for="export-format">
                                <span class="label-text">قالب خروجی</span>
                            </label>
                            <select
                                id="export-format"
                                class="select select-bordered"
                                bind:value={exportFormat}
                                disabled={isExporting}
                            >
                                <option value="csv">CSV</option>
                                <option value="xlsx">Excel (XLSX)</option>
                            </select>
                        </div>

                        <div class="card-actions mt-4">
                            <button
                                class="btn btn-primary w-full"
                                onclick={handleExportData}
                                disabled={isExporting}
                            >
                                {#if isExporting}
                                    <span class="loading loading-spinner loading-sm"></span>
                                {/if}
                                خروجی داده‌ها ({exportFormat === "xlsx"
                                    ? "Excel"
                                    : exportFormat.toUpperCase()})
                            </button>
                        </div>
                    </div>
                </div>
            {:else if activeTab === "map"}
                <div class="card bg-base-200">
                    <div class="card-body gap-5">
                        <section class="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                            <div class="max-w-3xl">
                                <h3 class="card-title">مدیریت نقشه آفلاین</h3>
                                <p class="text-sm text-gray-600 mt-2">
                                    بسته‌های نقشه فقط روی همین دستگاه ذخیره می‌شوند. هیچ نقشه یا منطقه‌ای از پیش انتخاب یا همراه برنامه ارائه نشده است. می‌توانید PMTiles وارد کنید یا با منبع XYZ مجاز، کاشی‌های رستری یک محدوده را دریافت کنید.
                                </p>
                                <p class="text-xs text-warning mt-2">
                                    دریافت انبوه از کاشی‌های استاندارد OpenStreetMap مسدود است. پیش از دانلود، شرایط ارائه‌دهندهٔ خود را بررسی کنید؛ منبع باید استفادهٔ آفلاین و دانلود انبوه را صریحاً مجاز بداند.
                                </p>
                            </div>

                            <div class="shrink-0">
                                <input
                                    bind:this={offlineMapInput}
                                    id="offline-map-file"
                                    class="hidden"
                                    type="file"
                                    accept=".pmtiles,application/octet-stream"
                                    onchange={handleOfflineMapSelection}
                                />
                                <button
                                    class="btn btn-primary"
                                    onclick={() => offlineMapInput?.click()}
                                    disabled={offlineMapLoading || isInspectingOfflineMap || isSavingOfflineMap || isDownloadingRegion}
                                >
                                    {#if isInspectingOfflineMap}
                                        <span class="loading loading-spinner loading-sm"></span>
                                        در حال بررسی...
                                    {:else}
                                        وارد کردن PMTiles
                                    {/if}
                                </button>
                            </div>
                        </section>

                        <section class="rounded-lg border border-base-300 bg-base-100 p-4 space-y-4">
                            <div>
                                <h4 class="font-semibold">دانلود کاشی‌های یک منطقه</h4>
                                <p class="text-xs text-gray-500 mt-1">
                                    نشانی قالب XYZ و سقف زوم ارائه‌دهنده را وارد کنید. الگو باید شامل {"{z}"}, {"{x}"} و {"{y}"} باشد؛ حداکثر زوم برنامه ۲۲ است. سقف بسته ۲۵٬۰۰۰ کاشی است.
                                </p>
                            </div>

                            <div class="form-control">
                                <label class="label" for="offline-tile-url">
                                    <span class="label-text">قالب نشانی HTTPS کاشی</span>
                                </label>
                                <input
                                    id="offline-tile-url"
                                    class="input input-bordered"
                                    type="text"
                                    bind:value={tileUrlTemplate}
                                    placeholder="https://tiles.example.com/&#123;z&#125;/&#123;x&#125;/&#123;y&#125;.png"
                                    disabled={isDownloadingRegion}
                                    autocomplete="off"
                                />
                            </div>

                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div class="form-control">
                                    <label class="label" for="region-name"><span class="label-text">نام بسته</span></label>
                                    <input id="region-name" class="input input-bordered" bind:value={regionName} placeholder="نام دلخواه" disabled={isDownloadingRegion} />
                                </div>
                                <div class="form-control">
                                    <label class="label" for="region-attribution"><span class="label-text">انتساب منبع</span></label>
                                    <input id="region-attribution" class="input input-bordered" bind:value={regionAttribution} placeholder="متن انتساب طبق شرایط ارائه‌دهنده" disabled={isDownloadingRegion} />
                                </div>
                                <div class="form-control">
                                    <label class="label" for="region-south"><span class="label-text">عرض جنوبی (°)</span></label>
                                    <input id="region-south" class="input input-bordered" type="number" min="-85.05112878" max="85.05112878" step="any" bind:value={regionSouth} disabled={isDownloadingRegion} />
                                </div>
                                <div class="form-control">
                                    <label class="label" for="region-west"><span class="label-text">طول غربی (°)</span></label>
                                    <input id="region-west" class="input input-bordered" type="number" min="-180" max="180" step="any" bind:value={regionWest} disabled={isDownloadingRegion} />
                                </div>
                                <div class="form-control">
                                    <label class="label" for="region-north"><span class="label-text">عرض شمالی (°)</span></label>
                                    <input id="region-north" class="input input-bordered" type="number" min="-85.05112878" max="85.05112878" step="any" bind:value={regionNorth} disabled={isDownloadingRegion} />
                                </div>
                                <div class="form-control">
                                    <label class="label" for="region-east"><span class="label-text">طول شرقی (°)</span></label>
                                    <input id="region-east" class="input input-bordered" type="number" min="-180" max="180" step="any" bind:value={regionEast} disabled={isDownloadingRegion} />
                                </div>
                                <div class="form-control">
                                    <label class="label" for="region-min-zoom"><span class="label-text">حداقل زوم</span></label>
                                    <input id="region-min-zoom" class="input input-bordered" type="number" min="0" max="22" step="1" bind:value={regionMinZoom} disabled={isDownloadingRegion} />
                                </div>
                                <div class="form-control">
                                    <label class="label" for="region-max-zoom"><span class="label-text">حداکثر زوم منبع</span></label>
                                    <input id="region-max-zoom" class="input input-bordered" type="number" min="0" max="22" step="1" bind:value={regionMaxZoom} disabled={isDownloadingRegion} />
                                </div>
                            </div>

                            <div class="rounded-md bg-base-200 p-3 text-sm" aria-live="polite">
                                {#if estimatedRegionTiles > 0}
                                    <span>برآورد: {estimatedRegionTiles.toLocaleString()} کاشی</span>
                                {:else}
                                    <span class="text-gray-500">برای برآورد، محدوده و بازهٔ زوم معتبر وارد کنید (عرض: ‎−85.05° تا 85.05° برای کاشی‌های وب).</span>
                                {/if}
                            </div>

                            <label class="label cursor-pointer justify-start items-start gap-3 whitespace-normal">
                                <input class="checkbox checkbox-primary mt-1 shrink-0" type="checkbox" bind:checked={confirmsOfflinePermission} disabled={isDownloadingRegion} />
                                <span class="label-text text-sm">تأیید می‌کنم که ارائه‌دهندهٔ این منبع، دانلود انبوه و استفادهٔ آفلاین را مجاز می‌داند و من شرایط و محدودیت‌های آن را رعایت می‌کنم.</span>
                            </label>

                            {#if downloadProgress}
                                <div class="space-y-1" aria-live="polite">
                                    <progress class="progress progress-primary w-full" value={downloadProgress.completed} max={Math.max(downloadProgress.total, 1)}></progress>
                                    <p class="text-xs text-gray-500">
                                        {downloadProgress.completed.toLocaleString()} / {downloadProgress.total.toLocaleString()} · {downloadProgress.storedTiles.toLocaleString()} کاشی ذخیره‌شده · {formatBytes(downloadProgress.downloadedBytes)}
                                    </p>
                                </div>
                            {/if}

                            <div class="flex flex-wrap gap-2">
                                <button
                                    class="btn btn-primary"
                                    onclick={startRegionDownload}
                                    disabled={isDownloadingRegion || offlineMapLoading || isInspectingOfflineMap || isSavingOfflineMap || !confirmsOfflinePermission || !regionName.trim() || !tileUrlTemplate.trim() || !regionAttribution.trim() || estimatedRegionTiles === 0}
                                >
                                    {#if isDownloadingRegion}
                                        <span class="loading loading-spinner loading-sm"></span>
                                        در حال دریافت...
                                    {:else}
                                        دریافت و نصب منطقه
                                    {/if}
                                </button>
                                {#if isDownloadingRegion}
                                    <button
                                        class="btn btn-outline"
                                        onclick={cancelRegionDownload}
                                        disabled={Boolean(downloadProgress && downloadProgress.total > 0 && downloadProgress.completed >= downloadProgress.total)}
                                    >
                                        {downloadProgress && downloadProgress.total > 0 && downloadProgress.completed >= downloadProgress.total ? "در حال ذخیره..." : "لغو دانلود"}
                                    </button>
                                {/if}
                            </div>
                        </section>

                        {#if pendingOfflineMap}
                            <section class="rounded-lg border border-primary/30 bg-base-100 p-4 space-y-4">
                                <div>
                                    <h4 class="font-semibold">آمادهٔ نصب: {pendingOfflineMap.info.name}</h4>
                                    <p class="text-xs text-gray-500 break-all mt-1">{pendingOfflineMap.info.fileName}</p>
                                    <p class="text-xs text-gray-500 mt-2">
                                        {formatBytes(pendingOfflineMap.info.sizeBytes)} · {tileKindLabel(pendingOfflineMap.info)} · زوم {pendingOfflineMap.info.minZoom}–{pendingOfflineMap.info.maxZoom} · محدوده {formatBounds(pendingOfflineMap.info)}
                                    </p>
                                </div>
                                <div class="form-control">
                                    <label class="label" for="offline-map-name"><span class="label-text">نام نمایشی</span></label>
                                    <input id="offline-map-name" class="input input-bordered" bind:value={offlineMapName} disabled={isSavingOfflineMap} />
                                </div>
                                <div class="form-control">
                                    <label class="label" for="offline-map-attribution"><span class="label-text">انتساب منبع نقشه</span></label>
                                    <textarea
                                        id="offline-map-attribution"
                                        class="textarea textarea-bordered w-full min-h-20"
                                        bind:value={offlineMapAttribution}
                                        placeholder="انتساب تعیین‌شده توسط ارائه‌دهندهٔ بسته"
                                        disabled={isSavingOfflineMap}
                                    ></textarea>
                                </div>
                                <div class="flex flex-wrap gap-2">
                                    <button class="btn btn-primary" onclick={saveSelectedOfflineMap} disabled={isSavingOfflineMap || !offlineMapAttribution.trim()}>
                                        {#if isSavingOfflineMap}<span class="loading loading-spinner loading-sm"></span>{/if}
                                        ذخیره و فعال‌سازی
                                    </button>
                                    <button class="btn btn-ghost" onclick={cancelOfflineMapSelection} disabled={isSavingOfflineMap}>انصراف</button>
                                </div>
                            </section>
                        {/if}

                        <section class="space-y-3">
                            <div class="flex items-center justify-between gap-3">
                                <h4 class="font-semibold">بسته‌های نصب‌شده</h4>
                                <span class="badge badge-ghost">{$offlineMaps.length}</span>
                            </div>
                            {#if offlineMapLoading}
                                <div class="flex items-center gap-3 text-sm text-gray-500">
                                    <span class="loading loading-spinner loading-sm"></span>
                                    در حال بارگذاری بسته‌ها...
                                </div>
                            {:else if $offlineMaps.length === 0}
                                <div class="alert alert-info">
                                    <span>بسته‌ای نصب نشده است. می‌توانید یک فایل PMTiles وارد کنید یا از فرم بالا بستهٔ رستری بسازید.</span>
                                </div>
                            {:else}
                                <div class="space-y-3">
                                    {#each $offlineMaps as mapInfo (mapInfo.id)}
                                        <article class="rounded-lg border {$offlineMap?.info.id === mapInfo.id ? 'border-success/50 bg-success/5' : 'border-base-300 bg-base-100'} p-4">
                                            <div class="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                                                <div class="min-w-0 space-y-1">
                                                    <div class="flex flex-wrap items-center gap-2">
                                                        <h5 class="font-semibold break-words">{mapInfo.name}</h5>
                                                        {#if $offlineMap?.info.id === mapInfo.id}<span class="badge badge-success badge-sm">فعال</span>{/if}
                                                        <span class="badge badge-outline badge-sm">{mapInfo.kind === "pmtiles" ? "PMTiles" : "XYZ رستری"}</span>
                                                    </div>
                                                    <p class="text-xs text-gray-500 break-all">{mapInfo.fileName}</p>
                                                    {#if mapInfo.providerHost}<p class="text-xs text-gray-500">منبع کاشی: {mapInfo.providerHost}</p>{/if}
                                                </div>
                                                <div class="flex flex-wrap gap-2 shrink-0">
                                                    {#if $offlineMap?.info.id !== mapInfo.id}
                                                        <button class="btn btn-sm btn-outline btn-primary" onclick={() => activateMap(mapInfo.id)} disabled={isActivatingOfflineMap || removingMapId !== null || isDownloadingRegion}>
                                                            {#if isActivatingOfflineMap}<span class="loading loading-spinner loading-xs"></span>{/if}
                                                            فعال‌سازی
                                                        </button>
                                                    {/if}
                                                    <button class="btn btn-sm btn-outline btn-error" onclick={() => deleteOfflineMap(mapInfo.id)} disabled={removingMapId !== null || isActivatingOfflineMap || isDownloadingRegion}>
                                                        {#if removingMapId === mapInfo.id}<span class="loading loading-spinner loading-xs"></span>{/if}
                                                        حذف
                                                    </button>
                                                </div>
                                            </div>
                                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm mt-4">
                                                <p><span class="font-medium">حجم:</span> {formatBytes(mapInfo.sizeBytes)}</p>
                                                <p><span class="font-medium">تعداد کاشی:</span> {mapInfo.tileCount.toLocaleString()}</p>
                                                <p><span class="font-medium">قالب:</span> {tileKindLabel(mapInfo)}</p>
                                                <p><span class="font-medium">بازهٔ زوم:</span> {mapInfo.minZoom} تا {mapInfo.maxZoom}</p>
                                                <p><span class="font-medium">محدوده (عرض، طول):</span> {formatBounds(mapInfo)}</p>
                                                <p class="sm:col-span-2 break-words"><span class="font-medium">انتساب منبع:</span> {mapInfo.attribution}</p>
                                            </div>
                                        </article>
                                    {/each}
                                </div>
                            {/if}
                        </section>

                        {#if offlineMapError}
                            <div class="alert alert-error" role="alert"><span>{offlineMapError}</span></div>
                        {/if}
                        {#if offlineMapSuccess}
                            <div class="alert alert-success" role="status"><span>{offlineMapSuccess}</span></div>
                        {/if}
                    </div>
                </div>
            {/if}
        </div>
    </div>
</div>
