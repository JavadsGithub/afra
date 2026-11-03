<main class="splash-screen" role="status" aria-live="polite" aria-busy="true">
    <div class="splash-content">
        <div class="logo-frame">
            <img src="/logo.jpg" alt="AFRA logo" />
        </div>

        <h1>AFRA <span>Ground Station</span></h1>
        <p class="tagline" dir="rtl">سامانه کنترل و پایش ربات</p>

        <div class="startup-status">
            <div class="loading-track" aria-hidden="true"><span></span></div>
            <p dir="rtl">در حال آماده‌سازی ایستگاه زمینی…</p>
        </div>
    </div>

    <div class="splash-orbit" aria-hidden="true"></div>
    <div class="splash-grid" aria-hidden="true"></div>
</main>

<style>
    .splash-screen {
        position: relative;
        display: grid;
        min-height: 100vh;
        min-height: 100dvh;
        width: 100%;
        place-items: center;
        overflow: hidden;
        isolation: isolate;
        color: #102b5b;
        background:
            radial-gradient(ellipse at 50% 42%, rgba(255, 255, 255, 0.98) 0%, rgba(247, 251, 255, 0.96) 43%, rgba(231, 242, 255, 0.98) 100%);
    }

    .splash-grid {
        position: absolute;
        z-index: -1;
        inset: 0;
        pointer-events: none;
        opacity: 0.7;
        background-image:
            linear-gradient(rgba(32, 91, 164, 0.035) 1px, transparent 1px),
            linear-gradient(90deg, rgba(32, 91, 164, 0.035) 1px, transparent 1px);
        background-size: 40px 40px;
        mask-image: radial-gradient(ellipse at center, #000 10%, transparent 76%);
    }

    .splash-orbit {
        position: absolute;
        z-index: -1;
        top: 50%;
        left: 50%;
        width: min(70vmin, 560px);
        aspect-ratio: 1;
        border: 1px solid rgba(38, 105, 195, 0.08);
        border-radius: 50%;
        box-shadow:
            0 0 0 28px rgba(44, 119, 214, 0.025),
            0 0 0 70px rgba(44, 119, 214, 0.018);
        transform: translate(-50%, -50%);
        pointer-events: none;
    }

    .splash-content {
        position: relative;
        z-index: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 2rem 1.25rem;
        text-align: center;
        animation: appear 500ms ease-out both;
    }

    .logo-frame {
        width: clamp(10rem, 32vh, 14rem);
        aspect-ratio: 1;
        padding: 6px;
        overflow: hidden;
        border: 1px solid rgba(34, 93, 165, 0.08);
        border-radius: 26px;
        background: #fff;
        box-shadow:
            0 24px 64px rgba(25, 70, 132, 0.14),
            0 4px 14px rgba(25, 70, 132, 0.06);
    }

    .logo-frame img {
        display: block;
        width: 100%;
        height: 100%;
        border-radius: 20px;
        object-fit: contain;
    }

    h1 {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 0.5rem;
        margin: 1.5rem 0 0;
        color: #102b5b;
        font-size: clamp(1.4rem, 4vw, 1.95rem);
        font-weight: 750;
        letter-spacing: -0.045em;
        line-height: 1.2;
    }

    h1 span {
        color: #3973bd;
        font-weight: 500;
    }

    .tagline {
        margin: 0.65rem 0 0;
        color: #657995;
        font-size: 0.95rem;
        font-weight: 500;
    }

    .startup-status {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.7rem;
        margin-top: 2rem;
    }

    .loading-track {
        width: 132px;
        height: 3px;
        overflow: hidden;
        direction: ltr;
        border-radius: 999px;
        background: #dce9f8;
    }

    .loading-track span {
        display: block;
        width: 40%;
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, #43bde9, #2857d5);
        animation: loading 1.35s ease-in-out infinite;
    }

    .startup-status p {
        margin: 0;
        color: #72839a;
        font-size: 0.8rem;
    }

    @keyframes loading {
        from { transform: translateX(-120%); }
        to { transform: translateX(280%); }
    }

    @keyframes appear {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
    }

    @media (max-height: 520px) {
        .splash-content { padding-block: 1rem; }
        .logo-frame { width: clamp(7rem, 23vh, 9.5rem); border-radius: 20px; }
        .logo-frame img { border-radius: 15px; }
        h1 { margin-top: 1rem; }
        .startup-status { margin-top: 1.25rem; }
    }

    @media (prefers-reduced-motion: reduce) {
        .splash-content { animation: none; }
        .loading-track span {
            width: 65%;
            animation: none;
        }
    }
</style>
