import { derived, writable } from "svelte/store";
import { loadTelemetries, type Telemetry } from "$lib/services/telemetry";

export const telemetryData = writable<Telemetry[]>([]);
export const isPolling = writable(false);

export const lastTelemetry = derived(telemetryData, ($data) =>
  $data.length > 0 ? $data[$data.length - 1] : null,
);

let intervalId: ReturnType<typeof setInterval> | null = null;

async function fetch() {
  try {
    const data = await loadTelemetries();
    telemetryData.set(data);
  } catch {
    // ignore
  }
}

export function startPolling() {
  if (intervalId) return;
  isPolling.set(true);
  fetch();
  intervalId = setInterval(fetch, 1000);
}

export function stopPolling() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  isPolling.set(false);
}

export function refresh() {
  fetch();
}
