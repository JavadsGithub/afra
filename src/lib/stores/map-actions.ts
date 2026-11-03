import { writable } from "svelte/store";

export type MapActionsState = {
  onToggleCommand: (() => void) | null;
  commandLoopActive: boolean;
  hasPins: boolean;
  hasPort: boolean;
};

export const mapActions = writable<MapActionsState>({
  onToggleCommand: null,
  commandLoopActive: false,
  hasPins: false,
  hasPort: false,
});
