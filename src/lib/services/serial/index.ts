import { invoke } from "@tauri-apps/api/core";

export interface SerialPort {
  name: string;
  path: string;
}

export async function scanPorts(): Promise<SerialPort[]> {
  return await invoke<SerialPort[]>("serial_scan_ports");
}

export async function connect(
  portPath: string,
  baudRate: number,
): Promise<void> {
  return await invoke<void>("serial_connect", { portName: portPath, baudRate });
}

export async function disconnect(): Promise<void> {
  return await invoke<void>("serial_disconnect");
}

export async function isConnected(): Promise<boolean> {
  return await invoke<boolean>("serial_is_connected");
}

export interface SerialPortInfo {
  port_name: string;
  baud_rate: number;
}

export async function getPortInfo(): Promise<SerialPortInfo> {
  return await invoke<SerialPortInfo>("serial_get_port_info");
}
