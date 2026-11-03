<script lang="ts">
    import { onMount } from "svelte";
    import { getAuthState } from "$lib/services/auth";
    import { handleLogin, handleSetPassword } from "$lib/stores/auth";
    import { Eye, EyeOff } from "lucide-svelte";

    let hasPassword = false;
    let isLoading = true;
    let password = "";
    let confirmPassword = "";
    let error = "";
    let isSubmitting = false;
    let showPassword = false;

    onMount(async () => {
        try {
            const state = await getAuthState();
            hasPassword = state.has_password;
        } catch {
            hasPassword = false;
        } finally {
            isLoading = false;
        }
    });

    async function handleSubmit() {
        error = "";

        if (!password || password.length < 4) {
            error = "رمز عبور باید حداقل ۴ کاراکتر باشد";
            return;
        }

        if (!hasPassword && password !== confirmPassword) {
            error = "رمز عبور و تکرار آن مطابقت ندارند";
            return;
        }

        isSubmitting = true;

        try {
            if (hasPassword) {
                const success = await handleLogin(password);
                if (!success) {
                    error = "رمز عبور اشتباه است";
                }
            } else {
                await handleSetPassword(password);
            }
        } catch (e: any) {
            error = e || "خطایی رخ داده است";
        } finally {
            isSubmitting = false;
        }
    }
</script>

<div class="flex min-h-screen items-center justify-center bg-base-200">
    <div class="card w-96 bg-base-100 shadow-xl">
        <div class="card-body">
            <h2 class="card-title justify-center text-2xl">
                {#if hasPassword}
                    ورود به سیستم
                {:else}
                    تنظیم رمز عبور
                {/if}
            </h2>

            {#if isLoading}
                <div class="flex justify-center py-4">
                    <span class="loading loading-spinner loading-lg"></span>
                </div>
            {:else}
                <form on:submit|preventDefault={handleSubmit}>
                    <div class="form-control">
                        <label class="label">
                            <span class="label-text">رمز عبور</span>
                        </label>
                        <div class="relative">
                            <input
                                type={showPassword ? "text" : "password"}
                                bind:value={password}
                                placeholder="رمز عبور را وارد کنید"
                                class="input input-bordered w-full"
                                autocomplete="current-password"
                            />
                            <button
                                type="button"
                                class="absolute left-3 top-1/2 -translate-y-1/2 btn btn-ghost btn-xs"
                                on:click={() => showPassword = !showPassword}
                            >
                                {#if showPassword}
                                    <EyeOff class="h-4 w-4" />
                                {:else}
                                    <Eye class="h-4 w-4" />
                                {/if}
                            </button>
                        </div>
                    </div>

                    {#if !hasPassword}
                        <div class="form-control mt-4">
                            <label class="label">
                                <span class="label-text">تکرار رمز عبور</span>
                            </label>
                            <input
                                type={showPassword ? "text" : "password"}
                                bind:value={confirmPassword}
                                placeholder="رمز عبور را مجدداً وارد کنید"
                                class="input input-bordered w-full"
                                autocomplete="new-password"
                            />
                        </div>
                    {/if}

                    {#if error}
                        <div class="alert alert-error mt-4">
                            <span>{error}</span>
                        </div>
                    {/if}

                    <div class="card-actions mt-6">
                        <button
                            type="submit"
                            class="btn btn-primary w-full"
                            disabled={isSubmitting}
                        >
                            {#if isSubmitting}
                                <span class="loading loading-spinner loading-sm"></span>
                            {:else if hasPassword}
                                ورود
                            {:else}
                                تنظیم رمز
                            {/if}
                        </button>
                    </div>
                </form>
            {/if}
        </div>
    </div>
</div>
