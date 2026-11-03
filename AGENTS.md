# AGENTS.md

## Commands

```bash
pnpm install           # Install dependencies
pnpm tauri dev         # Run full Tauri desktop app (frontend + Rust)
pnpm dev               # Frontend-only dev server (port 1420)
pnpm tauri build       # Production build
pnpm check             # Type check (svelte-kit sync && svelte-check)
```

## Architecture

**Stack**: Tauri 2 + SvelteKit 5 + TypeScript + Rust (edition 2021)
**Package manager**: pnpm
**Styling**: TailwindCSS v4 + DaisyUI v5
**Map**: Leaflet
**UI icons**: lucide-svelte
**Language**: Persian (fa), RTL layout

**Entry points**:

- `src-tauri/src/lib.rs` - Tauri app setup, all command registrations
- `src/routes/+layout.svelte` - Root layout, auth gate
- `src/routes/+page.svelte` - Main page, view router

**Directory boundaries**:

- `src/` - SvelteKit frontend (Svelte 5 runes syntax)
- `src-tauri/src/` - Rust backend (clean architecture: domain/application/infrastructure/interface)
- `mocker/` - Standalone Rust CLI for robot simulation

## Rust Backend Structure

```
src-tauri/src/
├── domain/entities/       # Data structs (Pin, Telemetry, AuthState)
├── domain/services/       # Interface definitions
├── domain/repositories/   # Repository interfaces
├── application/usecases/  # Business logic
├── infrastructure/        # Concrete implementations (file storage, telemetry)
├── interface/             # Tauri #[command] handlers
├── lib.rs                 # Tauri builder, manage() and invoke_handler registrations
└── main.rs                # Entry point, calls lib::run()
```

**Adding a new Tauri command**:

1. Create handler in `src-tauri/src/interface/` (use `#[tauri::command]`, return `Result<T, String>`)
2. Register module in `interface/mod.rs`
3. Add to `invoke_handler![]` in `lib.rs`
4. If it needs managed state, add `.manage()` in `lib.rs` and use `State<'_, Arc<T>>` parameter

## Frontend Patterns

- **Svelte 5**: Uses runes syntax (`$props()`, `$effect()`, `$state()`)
- **SSR disabled**: `export const ssr = false` in `+layout.ts` (Tauri has no Node.js server)
- **Adapter**: `@sveltejs/adapter-static` for SSG
- **Stores**: `$lib/stores/` (writable stores with helper functions)
- **Services**: `$lib/services/` (Tauri `invoke()` wrappers)
- **Components**: `$lib/components/` organized by feature

**Calling Rust from Svelte**:

```ts
import { invoke } from "@tauri-apps/api/core";
const result = await invoke<T>("command_name", { arg1, arg2 });
```

## Authentication

Password-based auth gates the app:

- First run: user sets a password (SHA-256 hash stored in app data dir)
- Subsequent runs: login required
- Hash stored at `<data_dir>/tauri-app/auth_config.json`
- Auth state: `$lib/stores/auth.ts` with `initAuth()`, `handleLogin()`, `handleLogout()`
- Layout (`+layout.svelte`) shows `LoginPage` when not authenticated
- Logout button in Header component

## Serial Communication

- Default port: `/dev/ttyUSB0` (Linux), configurable via UI settings
- Default baud rate: 115200
- Robot commands: START, STOP, READ_DATA_LOG, READ_ERROR_LOG (JSON format)
- `mocker/` directory has a CLI tool for testing without physical robot

## Quirks

- Vite dev server uses fixed port **1420** (Tauri requirement), `strictPort: true`
- `svelte-kit sync` must run before `svelte-check` (generates `.svelte-kit/tsconfig.json`)
- Windows port names use `COMx` format, not `/dev/ttyUSBx`
- All Tauri commands return `Result<T, String>` - errors are string messages
- Auth commands (`get_auth_state`, `login`, `set_password`, `logout`, `is_authenticated`) do NOT check auth state themselves
