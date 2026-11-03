import { invoke } from "@tauri-apps/api/core";

export async function sendStartMission(): Promise<number[]> {
  return await invoke<number[]>("serial_send_start_mission");
}

export async function sendStopMission(): Promise<number[]> {
  return await invoke<number[]>("serial_send_stop_mission");
}
