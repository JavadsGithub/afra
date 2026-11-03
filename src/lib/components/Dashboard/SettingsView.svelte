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

    // Subscribe to the settings store to get current values
    let currentSettings = $settings;

    onMount(() => {
        loadInterval();
        refreshPorts();
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
            {/if}
        </div>
    </div>
</div>
