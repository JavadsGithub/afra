<script lang="ts">
    import { onMount } from "svelte";
    import {
        getAllPins,
        deletePin,
        updatePin,
        addPin,
    } from "$lib/services/pins";
    import type { Pin } from "$lib/services/pins";

    let pins: Pin[] = [];
    let filteredPins: Pin[] = [];
    let searchTerm = "";
    let showEditModal = false;
    let currentPin: Pin | null = null;
    let newPinMode = false;

    // Load pins when component mounts
    onMount(async () => {
        await loadPins();
    });

    async function loadPins() {
        try {
            pins = await getAllPins();
            filteredPins = [...pins];
        } catch (error) {
            console.error("Error loading pins:", error);
        }
    }

// Filter pins based on search term
$: filteredPins = pins.filter(
    (pin) =>
        pin.id.toString().includes(searchTerm),
);

    async function handleDelete(pinId: number) {
        if (confirm("آیا از حذف این پین اطمینان دارید؟")) {
            try {
                const success = await deletePin(pinId);
                if (success) {
                    await loadPins(); // Refresh the list
                }
            } catch (error) {
                console.error("Error deleting pin:", error);
                alert("خطا در حذف پین");
            }
        }
    }

    function openEditModal(pin: Pin | null = null) {
        currentPin = pin
            ? { ...pin }
            : {
                  id: 0,
                  lat: 0,
                  lng: 0,
                  depth: 0,
                  speed: 0,
                  under_water_time: 0,
                  mission_time: 0,
              };
        newPinMode = pin === null;
        showEditModal = true;
    }

    async function savePin() {
        if (!currentPin) return;

        try {
            if (newPinMode) {
                await addPin(
                    Date.now(),
                    currentPin.lat || 0,
                    currentPin.lng || 0,
                    currentPin.depth || 0,
                    currentPin.speed || 0,
                    currentPin.under_water_time || 0,
                    currentPin.mission_time || 0,
                );
            } else {
                await updatePin(
                    currentPin.id,
                    currentPin.lat,
                    currentPin.lng,
                    currentPin.depth || 0,
                    currentPin.speed || 0,
                    currentPin.under_water_time || 0,
                    currentPin.mission_time || 0,
                );
            }

            showEditModal = false;
            await loadPins();
        } catch (error) {
            console.error("Error saving pin:", error);
            alert("خطا در ذخیره پین");
        }
    }
</script>

<div class="p-6">
    <h1 class="text-3xl font-bold mb-6">جدول پین‌ها</h1>
    <div class="bg-base-100 p-6 rounded-lg shadow overflow-x-auto">
        <div class="mb-4 flex justify-between items-center">
            <div>
                <input
                    type="text"
                    placeholder="جستجوی پین..."
                    class="input input-bordered w-full max-w-xs"
                    bind:value={searchTerm}
                />
            </div>
            <div>
                <button class="btn btn-primary" on:click={() => openEditModal()}
                    >افزودن پین جدید</button
                >
            </div>
        </div>
        <table class="table table-zebra">
            <thead>
                <tr>
                    <th>ردیف</th>
                    <th>عرض جغرافیایی</th>
                    <th>طول جغرافیایی</th>
                    <th>شناسه</th>
                    <th>عملیات</th>
                </tr>
            </thead>
            <tbody>
                {#each filteredPins as pin, index}
                    <tr>
                        <th>{index + 1}</th>
                        <td>{pin.lat.toFixed(6)}</td>
                        <td>{pin.lng.toFixed(6)}</td>
                        <td>{pin.id.toFixed(0)}</td>
                        <td>
                            <button
                                class="btn btn-xs btn-outline mr-1"
                                on:click={() => openEditModal(pin)}
                                >ویرایش</button
                            >
                            <button
                                class="btn btn-xs btn-outline btn-error"
                                on:click={() => handleDelete(pin.id)}
                                >حذف</button
                            >
                        </td>
                    </tr>
                {:else}
                    <tr>
                        <td colspan="5" class="text-center py-4"
                            >هیچ پینی یافت نشد</td
                        >
                    </tr>
                {/each}
            </tbody>
        </table>
        <div class="mt-4 flex justify-between items-center">
            <div>نمایش {filteredPins.length} از {pins.length} پین</div>
            <div class="join">
                <button class="join-item btn" disabled>قبلی</button>
                <button class="join-item btn btn-active">۱</button>
                <button class="join-item btn" disabled>بعدی</button>
            </div>
        </div>
    </div>

    <!-- Edit/Add Pin Modal -->
    {#if showEditModal}
        <div class="modal modal-open">
            <div class="modal-box">
                <h3 class="font-bold text-lg">
                    {newPinMode ? "افزودن پین جدید" : "ویرایش پین"}
                </h3>
                <div class="py-4 space-y-4">
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="label">عرض جغرافیایی</label>
                            <input
                                type="number"
                                class="input input-bordered w-full"
                                bind:value={currentPin!.lat}
                                step="any"
                            />
                        </div>
                        <div>
                            <label class="label">طول جغرافیایی</label>
                            <input
                                type="number"
                                class="input input-bordered w-full"
                                bind:value={currentPin!.lng}
                                step="any"
                            />
                        </div>
                    </div>
                    <div>
                        <label class="label">عمق</label>
                        <input
                            type="number"
                            class="input input-bordered w-full"
                            bind:value={currentPin!.depth}
                            step="any"
                        />
                    </div>
                    <div>
                        <label class="label">سرعت</label>
                        <input
                            type="number"
                            class="input input-bordered w-full"
                            bind:value={currentPin!.speed}
                            step="any"
                        />
                    </div>
                    <div>
                        <label class="label">مدت زمان زیر آب</label>
                        <input
                            type="number"
                            class="input input-bordered w-full"
                            bind:value={currentPin!.under_water_time}
                            step="any"
                        />
                    </div>
                    <div>
                        <label class="label">زمان ماموریت</label>
                        <input
                            type="number"
                            class="input input-bordered w-full"
                            bind:value={currentPin!.mission_time}
                            step="any"
                        />
                    </div>
                </div>
                <div class="modal-action">
                    <button class="btn btn-primary" on:click={savePin}
                        >ذخیره</button
                    >
                    <button class="btn" on:click={() => (showEditModal = false)}
                        >لغو</button
                    >
                </div>
            </div>
        </div>
    {/if}
</div>
