// Pin service module providing a clean interface to pin-related Tauri commands

import { invoke } from '@tauri-apps/api/core';

// Define TypeScript interface for Pin data structure
export interface Pin {
  id: number;
  lat: number;
  lng: number;
  depth: number;
  speed: number;
  under_water_time: number;
  mission_time: number;
}

// Pin management functions
export async function savePins(pins: Pin[]): Promise<void> {
  return await invoke<void>('save_pins', { pins });
}

export async function loadPins(): Promise<Pin[]> {
  return await invoke<Pin[]>('load_pins');
}

export async function addPin(
  id: number,
  lat: number,
  lng: number,
  depth: number,
  speed: number,
  underWaterTime: number,
  missionTime: number,
): Promise<Pin> {
  return await invoke<Pin>('add_pin', { id, lat, lng, depth, speed, underWaterTime, missionTime });
}

export async function updatePin(
  id: number,
  lat: number,
  lng: number,
  depth: number,
  speed: number,
  underWaterTime: number,
  missionTime: number,
): Promise<boolean> {
  return await invoke<boolean>('update_pin', { id, lat, lng, depth, speed, underWaterTime, missionTime });
}

export async function deletePin(id: number): Promise<boolean> {
  return await invoke<boolean>('delete_pin', { id });
}

export async function getAllPins(): Promise<Pin[]> {
  return await invoke<Pin[]>('get_all_pins');
}

// Export/import functions
export async function exportPins(filePath: string, format: string): Promise<void> {
  return await invoke<void>('export_pins', { filePath, format });
}

export async function importPins(filePath: string, format: string): Promise<void> {
  return await invoke<void>('import_pins', { filePath, format });
}
