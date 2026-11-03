import { writable, type Writable } from "svelte/store";

// Define the navigation item type
export interface NavItem {
  id: string;
  label: string;
  group: string;
}

// Define the navigation group type
export interface NavGroup {
  id: string;
  label: string;
  expanded: boolean;
}

// Define the navigation state type
export interface NavigationState {
  activeNav: NavItem;
  sidebarCollapsed: boolean;
  navGroups: NavGroup[];
}

// Initial navigation state
export const initialNavigationState: NavigationState = {
  activeNav: { id: "map", label: "نقشه", group: "main" },
  sidebarCollapsed: false,
  navGroups: [
    { id: "main", label: "اصلی", expanded: true },
  ],
};

// Create the single navigation store
export const navigationStore: Writable<NavigationState> = writable(
  initialNavigationState,
);

// Navigation items (not part of the store, just a constant array)
export const navItems: NavItem[] = [
  { id: "map", label: "نقشه", group: "" },
  { id: "waypoints", label: "پین‌ها", group: "" },
  { id: "telemetry", label: "تله‌متری", group: "" },
];

// Actions for updating the navigation store
export const setActiveNav = (item: NavItem) => {
  navigationStore.update((state) => ({
    ...state,
    activeNav: item,
  }));
};

export const toggleSidebar = () => {
  navigationStore.update((state) => ({
    ...state,
    sidebarCollapsed: !state.sidebarCollapsed,
  }));
};

export const setSidebarCollapsed = (collapsed: boolean) => {
  navigationStore.update((state) => ({
    ...state,
    sidebarCollapsed: collapsed,
  }));
};

export const toggleGroup = (groupId: string) => {
  navigationStore.update((state) => ({
    ...state,
    navGroups: state.navGroups.map((g) =>
      g.id === groupId ? { ...g, expanded: !g.expanded } : g,
    ),
  }));
};

export const setGroupExpanded = (groupId: string, expanded: boolean) => {
  navigationStore.update((state) => ({
    ...state,
    navGroups: state.navGroups.map((g) =>
      g.id === groupId ? { ...g, expanded } : g,
    ),
  }));
};

// Helper functions to access specific parts of the state
export const getActiveNav = (callback: (activeNav: NavItem) => void) => {
  navigationStore.subscribe((state) => callback(state.activeNav));
};

export const getSidebarCollapsed = (
  callback: (sidebarCollapsed: boolean) => void,
) => {
  navigationStore.subscribe((state) => callback(state.sidebarCollapsed));
};

export const getNavGroups = (callback: (navGroups: NavGroup[]) => void) => {
  navigationStore.subscribe((state) => callback(state.navGroups));
};
