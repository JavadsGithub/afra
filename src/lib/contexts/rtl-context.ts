import { getContext, setContext } from "svelte";
import { writable, type Writable } from "svelte/store";

export type RtlDirection = "ltr" | "rtl";

export interface RtlContext {
  direction: Writable<RtlDirection>;
  toggleDirection: () => void;
  setDirection: (dir: RtlDirection) => void;
  isRtl: Writable<boolean>;
}

const RTL_CONTEXT_KEY = "RTL_CONTEXT";

export function setRtlContext(): RtlContext {
  // Determine initial direction based on the HTML lang attribute
  let initialDirection: RtlDirection = "ltr";
  if (typeof document !== "undefined") {
    const htmlLang = document.documentElement.lang;
    const isRtlLanguage = [
      "ar",
      "fa",
      "he",
      "ur",
      "ps",
      "sd",
      "ug",
      "ku",
      "dv",
      "ha",
    ].includes(htmlLang);
    initialDirection = isRtlLanguage ? "rtl" : "ltr";
  }

  const direction = writable<RtlDirection>(initialDirection);
  const isRtl = writable<boolean>(initialDirection === "rtl");

  const toggleDirection = () => {
    direction.update((current) => {
      const newDirection = current === "ltr" ? "rtl" : "ltr";
      updateDocumentDirection(newDirection);
      return newDirection;
    });
  };

  const setDirection = (dir: RtlDirection) => {
    direction.set(dir);
    updateDocumentDirection(dir);
  };

  // Update the document direction when direction changes
  direction.subscribe((value) => {
    isRtl.set(value === "rtl");
    updateDocumentDirection(value);
  });

  const context: RtlContext = {
    direction,
    toggleDirection,
    setDirection,
    isRtl,
  };

  setContext(RTL_CONTEXT_KEY, context);
  return context;
}

export function getRtlContext(): RtlContext {
  return getContext(RTL_CONTEXT_KEY);
}

function updateDocumentDirection(dir: RtlDirection) {
  // Update the html element's dir attribute
  if (typeof document !== "undefined") {
    document.documentElement.dir = dir;

    // Preserve the original language if it's an RTL language
    const originalLang = document.documentElement.lang;
    const isOriginalRtlLanguage = [
      "ar",
      "fa",
      "he",
      "ur",
      "ps",
      "sd",
      "ug",
      "ku",
      "dv",
      "ha",
    ].includes(originalLang);

    if (dir === "rtl") {
      // If the original language was RTL, preserve it
      if (isOriginalRtlLanguage) {
        document.documentElement.lang = originalLang;
      } else {
        // Otherwise, set a default RTL language (using 'fa' for Persian as specified in app.html)
        document.documentElement.lang = "fa";
      }
    } else {
      // For LTR, we can set to English
      document.documentElement.lang = "en";
    }
  }
}

// Utility to initialize RTL based on browser or system preference
export function initializeRtlFromPreferences(): RtlDirection {
  if (typeof window !== "undefined") {
    // Check for saved preference in localStorage
    const savedDir = localStorage.getItem(
      "rtl-direction",
    ) as RtlDirection | null;
    if (savedDir) {
      return savedDir;
    }

    // Check for HTML lang attribute to determine initial direction
    const htmlLang = document.documentElement.lang;
    const isRtlLanguage = [
      "ar",
      "fa",
      "he",
      "ur",
      "ps",
      "sd",
      "ug",
      "ku",
      "dv",
      "ha",
    ].includes(htmlLang);
    if (isRtlLanguage) {
      return "rtl";
    }

    // Check for browser/system preference
    // For now, default to ltr, but could be changed based on locale detection
    return "ltr";
  }
  return "ltr";
}
