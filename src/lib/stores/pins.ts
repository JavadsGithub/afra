import { writable } from "svelte/store";

export interface Pin {
  id: number;
  lat: number;
  lng: number;
  depth: number;
  speed: number;
  under_water_time: number;
  mission_time: number;
  createdAt: Date;
  updatedAt: Date;
}

interface PinsStore {
  pins: Pin[];
}

function createPinsStore() {
  const { subscribe, update } = writable<PinsStore>({ pins: [] });

  return {
    subscribe,
    create: (pinData: Omit<Pin, "id" | "createdAt" | "updatedAt">): Pin => {
      const newPin: Pin = {
        id: Date.now(),
        ...pinData,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      update((store) => ({ pins: [...store.pins, newPin] }));
      return newPin;
    },
    getAll: (): Pin[] => {
      let pins: Pin[] = [];
      subscribe((store) => (pins = store.pins))();
      return pins;
    },
    getById: (id: number): Pin | undefined => {
      let pins: Pin[] = [];
      subscribe((store) => (pins = store.pins))();
      return pins.find((pin) => pin.id === id);
    },
    update: (id: number, updates: Partial<Omit<Pin, "id" | "createdAt">>): void => {
      update((store) => ({
        pins: store.pins.map((pin) =>
          pin.id === id ? { ...pin, ...updates, updatedAt: new Date() } : pin,
        ),
      }));
    },
    delete: (id: number): void => {
      update((store) => ({ pins: store.pins.filter((pin) => pin.id !== id) }));
    },
    clear: (): void => update(() => ({ pins: [] })),
  };
}

export const pinsStore = createPinsStore();
