import { invoke } from '@tauri-apps/api/core';

export interface PortInfo {
  name: string;
  path: string;
}

export async function scanPorts(): Promise<PortInfo[]> {
  return await invoke<PortInfo[]>('scan_ports');
}
