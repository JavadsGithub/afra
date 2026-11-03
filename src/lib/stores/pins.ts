import { writable, type Writable } from "svelte/store";
import type { Map as LeafletMap, Marker } from "leaflet";
import L from "leaflet";

// Define the Pin type
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

// Define the store type
interface PinsStore {
  pins: Pin[];
  // Reference to markers on the map to manage them
  markers: Map<number, Marker>;
}

// Create the initial state
const createPinsStore = () => {
  const { subscribe, set, update } = writable<PinsStore>({
    pins: [],
    markers: new Map<number, Marker>(),
  });

  // CRUD operations
  return {
    subscribe,

    // Create a new pin
    create: (pinData: Omit<Pin, "id" | "createdAt" | "updatedAt">): Pin => {
      const newPin: Pin = {
        id: Date.now(),
        ...pinData,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      update((store) => {
        store.pins.push(newPin);
        return { ...store };
      });

      return newPin;
    },

    // Read all pins
    getAll: (): Pin[] => {
      let allPins: Pin[] = [];
      subscribe((store) => (allPins = store.pins))();
      return allPins;
    },

    // Read a specific pin by ID
    getById: (id: number): Pin | undefined => {
      let allPins: Pin[] = [];
      subscribe((store) => (allPins = store.pins))();
      return allPins.find((pin) => pin.id === id);
    },

    // Update a pin
    update: (
      id: number,
      updates: Partial<Omit<Pin, "id" | "createdAt">>,
    ): void => {
      update((store) => {
        const pinIndex = store.pins.findIndex((pin) => pin.id === id);
        if (pinIndex !== -1) {
          const pin = store.pins[pinIndex];
          store.pins[pinIndex] = {
            ...pin,
            ...updates,
            updatedAt: new Date(),
          };
        }
        return { ...store };
      });
    },

    // Delete a pin
    delete: (id: number): void => {
      update((store) => {
        store.pins = store.pins.filter((pin) => pin.id !== id);
        return { ...store };
      });
    },

    // Clear all pins
    clear: (): void => {
      update((store) => {
        store.pins = [];
        return { ...store };
      });
    },

    // Add a marker for a specific pin to the map
    addMarkerToMap: (pinId: number, marker: Marker) => {
      update((store) => {
        store.markers.set(pinId, marker);
        return { ...store };
      });
    },

    // Remove a marker from the map
    removeMarkerFromMap: (pinId: number) => {
      update((store) => {
        store.markers.delete(pinId);
        return { ...store };
      });
    },

    // Get a marker by pin ID
    getMarkerById: (id: number): Marker | undefined => {
      let markers: Map<number, Marker> = new Map();
      subscribe((store) => (markers = store.markers))();
      return markers.get(id);
    },

    // Clear all markers from map
    clearMarkers: () => {
      update((store) => {
        store.markers.clear();
        return { ...store };
      });
    },

    // Update the markers on the map based on the current pins
    updateMarkersOnMap: (map: LeafletMap) => {
      update((store) => {
        // Clear existing markers from the map
        store.markers.forEach((marker) => {
          map.removeLayer(marker);
        });

        // Clear the markers map
        store.markers.clear();

        // Add current pins as markers to the map
        store.pins.forEach((pin) => {
          const marker = L.marker([pin.lat, pin.lng]).addTo(map);
          store.markers.set(pin.id, marker);
        });

        return { ...store };
      });
    },
  };
};

export const pinsStore = createPinsStore();
