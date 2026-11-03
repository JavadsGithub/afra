<script lang="ts">
  import { deleteTelemetry, clearAllTelemetries } from "$lib/services/telemetry";
  import { telemetryData, isPolling, refresh } from "$lib/stores/telemetry";
  import { Trash2, RotateCw, Search, AlertTriangle, Database } from "lucide-svelte";

  let searchTerm = $state("");
  let showClearConfirm = $state(false);

  let filtered = $derived.by(() => {
    const data = $telemetryData;
    if (!searchTerm.trim()) return data;
    const q = searchTerm.toLowerCase();
    return data.filter(
      (t) =>
        String(t.mission_id).includes(q) ||
        String(t.timestamp).includes(q) ||
        String(t.status).includes(q) ||
        String(t.latitude.toFixed(4)).includes(q) ||
        String(t.longitude.toFixed(4)).includes(q),
    );
  });

  async function handleDelete(ts: number) {
    if (!confirm("آیا از حذف این رکورد اطمینان دارید؟")) return;
    try {
      await deleteTelemetry(ts);
      refresh();
    } catch (e) {
      console.error("Failed to delete telemetry:", e);
      alert("خطا در حذف رکورد");
    }
  }

  async function handleClearAll() {
    showClearConfirm = false;
    try {
      await clearAllTelemetries();
      refresh();
    } catch (e) {
      console.error("Failed to clear telemetries:", e);
      alert("خطا در پاک‌سازی داده‌ها");
    }
  }

  function formatTimestamp(ts: number): string {
    return new Date(ts * 1000).toLocaleString("fa-IR");
  }

  function statusLabel(s: number): string {
    const labels: Record<number, string> = { 0: "عادی", 1: "هشدار", 2: "خطا" };
    return labels[s] ?? String(s);
  }
</script>

<div class="space-y-4 p-4">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-2">
      <Database class="h-5 w-5 text-primary" />
      <h2 class="text-lg font-semibold">مدیریت داده‌های تله‌متری</h2>
    </div>
    <div class="flex items-center gap-2 text-sm text-gray-500">
      <span>{$telemetryData.length} رکورد</span>
      <button class="btn btn-ghost btn-sm btn-square" onclick={refresh} title="بارگذاری مجدد">
        <RotateCw class="h-4 w-4" />
      </button>
    </div>
  </div>

  <!-- Toolbar -->
  <div class="flex items-center gap-2">
    <label class="input input-bordered flex items-center gap-2 flex-1">
      <Search class="h-4 w-4 text-gray-400" />
      <input type="text" class="grow" placeholder="جستجو..." bind:value={searchTerm} />
    </label>
    {#if $telemetryData.length > 0}
      <button class="btn btn-error btn-sm" onclick={() => (showClearConfirm = true)}>
        <Trash2 class="h-4 w-4" />
        پاک‌سازی همه
      </button>
    {/if}
  </div>

  <!-- Table -->
  <div class="overflow-x-auto rounded-box border border-base-300">
    <table class="table table-zebra table-sm">
      <thead>
        <tr>
          <th>زمان</th>
          <th>عرض جغرافیایی</th>
          <th>طول جغرافیایی</th>
          <th>عمق</th>
          <th>سرعت</th>
          <th>هدینگ</th>
          <th>RPS</th>
          <th>آمپر</th>
          <th>دما</th>
          <th>باتری</th>
          <th>ماموریت</th>
          <th>وضعیت</th>
          <th>خطا</th>
          <th class="w-16"></th>
        </tr>
      </thead>
      <tbody>
        {#if $isPolling && $telemetryData.length === 0}
          <tr>
            <td colspan="14" class="text-center py-8 text-gray-400">
              <span class="loading loading-spinner loading-md"></span>
            </td>
          </tr>
        {:else if filtered.length === 0}
          <tr>
            <td colspan="14" class="text-center py-8 text-gray-400">
              {searchTerm ? "نتیجه‌ای یافت نشد" : "داده‌ای موجود نیست"}
            </td>
          </tr>
        {:else}
          {#each filtered as t, i (i)}
            <tr>
              <td class="text-xs whitespace-nowrap">{formatTimestamp(t.timestamp)}</td>
              <td>{t.latitude.toFixed(4)}</td>
              <td>{t.longitude.toFixed(4)}</td>
              <td>{t.depth.toFixed(1)}</td>
              <td>{t.speed.toFixed(1)}</td>
              <td>{t.yaw.toFixed(1)}</td>
              <td>{t.rps.toFixed(1)}</td>
              <td>{t.ampere.toFixed(1)}</td>
              <td>{t.temperature.toFixed(1)}</td>
              <td>{t.battery_level.toFixed(0)}%</td>
              <td>{t.mission_id}</td>
              <td>
                <span class="badge badge-{t.status === 0 ? 'success' : t.status === 1 ? 'warning' : 'error'} badge-xs">
                  {statusLabel(t.status)}
                </span>
              </td>
              <td class="text-xs text-error">{t.error || "—"}</td>
              <td>
                <button class="btn btn-ghost btn-xs btn-square text-error" onclick={() => handleDelete(t.timestamp)} title="حذف">
                  <Trash2 class="h-3.5 w-3.5" />
                </button>
              </td>
            </tr>
          {/each}
        {/if}
      </tbody>
    </table>
  </div>
</div>

<!-- Clear all confirmation modal -->
{#if showClearConfirm}
  <div class="modal modal-open" role="dialog" onkeydown={(e) => e.key === "Escape" && (showClearConfirm = false)}>
    <div class="modal-box">
      <div class="flex flex-col items-center gap-4 py-4">
        <button class="btn btn-ghost btn-xs btn-square absolute left-2 top-2" onclick={() => (showClearConfirm = false)}>✕</button>
        <AlertTriangle class="h-12 w-12 text-warning" />
        <h3 class="text-lg font-bold">پاک‌سازی همه داده‌ها</h3>
        <p class="text-center text-sm text-gray-500">
          آیا از حذف تمام {$telemetryData.length} رکورد تله‌متری اطمینان دارید؟ این عمل قابل بازگشت نیست.
        </p>
      </div>
      <div class="modal-action">
        <button class="btn btn-ghost" onclick={() => (showClearConfirm = false)}>انصراف</button>
        <button class="btn btn-error" onclick={handleClearAll}>تأیید و پاک‌سازی</button>
      </div>
    </div>
    <div class="modal-backdrop" onclick={() => (showClearConfirm = false)}></div>
  </div>
{/if}
