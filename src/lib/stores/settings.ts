import { derived, get, writable } from "svelte/store";
import {
  connect as serialConnect,
  disconnect as serialDisconnect,
  isConnected,
  scanPorts,
} from "$lib/services/serial";

type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

type Settings = {
  baud_rate: number;
  frequency_mhz: number;
  tx_power: number;
  channel_bandwidth: number;
  simulation_mode: boolean;
  port: string;
  is_connected: boolean;
  mode: "idle" | "sending" | "receiving";
};

const defaultSettings: Settings = {
  baud_rate: 115200,
  frequency_mhz: 433.0,
  tx_power: 100,
  channel_bandwidth: 125.0,
  simulation_mode: false,
  port: "",
  is_connected: false,
  mode: "idle",
};

export const settings = writable<Settings>(defaultSettings);
export const connectionStatus = writable<ConnectionStatus>("disconnected");
export const connectionError = writable<string>("");

export const isPortConnected = derived(
  connectionStatus,
  ($status) => $status === "connected",
);

// Connect using current settings
export async function connectToPort(): Promise<void> {
  const currentSettings = get(settings);

  if (!currentSettings.port) {
    connectionStatus.set("error");
    connectionError.set("No port selected");
    return;
  }

  connectionStatus.set("connecting");
  connectionError.set("");

  try {
    await serialConnect(currentSettings.port, currentSettings.baud_rate);
    connectionStatus.set("connected");
    settings.update((prev) => ({ ...prev, is_connected: true }));
  } catch (e) {
    connectionStatus.set("error");
    connectionError.set(String(e));
    settings.update((prev) => ({ ...prev, is_connected: false }));
    throw e;
  }
}

export async function disconnectFromPort(): Promise<void> {
  try {
    await serialDisconnect();
  } finally {
    connectionStatus.set("disconnected");
    settings.update((prev) => ({ ...prev, is_connected: false }));
  }
}

// Convenience functions for updating specific fields
export const updateBaudRate = (baudRate: number) => {
  settings.update((prev) => ({ ...prev, baud_rate: baudRate }));
};

export const updateFrequency = (freq: number) => {
  settings.update((prev) => ({ ...prev, frequency_mhz: freq }));
};

export const updateTxPower = (power: number) => {
  settings.update((prev) => ({ ...prev, tx_power: power }));
};

export const updateChannelBandwidth = (bandwidth: number) => {
  settings.update((prev) => ({ ...prev, channel_bandwidth: bandwidth }));
};

export const updateSimulationMode = (mode: boolean) => {
  settings.update((prev) => ({ ...prev, simulation_mode: mode }));
};

export const updatePort = (port: string) => {
  settings.update((prev) => ({ ...prev, port }));
};

export const updateMode = (newMode: Settings["mode"]) => {
  settings.update((prev) => ({ ...prev, mode: newMode }));
};

export const updateSettings = (newSettings: Partial<Settings>) => {
  settings.update((prev) => ({ ...prev, ...newSettings }));
};

export const resetSettings = () => {
  settings.set(defaultSettings);
};
