import { invoke } from "@tauri-apps/api/core";

export interface Telemetry {
  latitude: number;
  longitude: number;
  yaw: number;
  depth: number;
  rps: number;
  ampere: number;
  wtd: number;
  temperature: number;
  timestamp: number;
  speed: number;
  battery_level: number;
  mission_id: number;
  status: number;
  error: number;
}

export async function loadTelemetries(): Promise<Telemetry[]> {
  return await invoke<Telemetry[]>("load_telemetries");
}

export async function deleteTelemetry(timestamp: number): Promise<boolean> {
  return await invoke<boolean>("delete_telemetry", { timestamp });
}

export async function clearAllTelemetries(): Promise<void> {
  return await invoke<void>("clear_all_telemetries");
}

export async function exportTelemetries(
  filePath: string | null,
  format: string,
): Promise<string> {
  return await invoke<string>("export_telemetries", { filePath, format });
}


