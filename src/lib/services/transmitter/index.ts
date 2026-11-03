import { invoke } from "@tauri-apps/api/core";
import type { Pin } from "../pins";

export async function sendPins(pins: Pin[]): Promise<string> {
  return await invoke<string>("serial_send_pins", { pins });
}
