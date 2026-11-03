// src/lib/helpers/rtl-helpers.ts
import { getContext } from 'svelte';
import type { RtlContext, RtlDirection } from '$lib/contexts/rtl-context';

export interface RtlAction {
  (node: HTMLElement, direction: RtlDirection): {
    update?(direction: RtlDirection): void;
    destroy?(): void;
  };
}

/**
 * Svelte action to automatically apply RTL-aware styles to an element
 * Usage: <div use:rtlAwareClass={{ dir: currentDir, base: "ml-4 mr-2" }}>
 */
export const rtlAwareClass: RtlAction = (node, initialDirection) => {
  let currentDirection: RtlDirection = initialDirection;

  const updateClasses = (dir: RtlDirection) => {
    // Remove any previously applied RTL classes
    node.classList.remove('rtl', 'ltr');

    // Add direction class
    node.classList.add(dir);

    // Update any RTL-specific attributes
    node.setAttribute('dir', dir);
  };

  updateClasses(currentDirection);

  return {
    update(dir: RtlDirection) {
      currentDirection = dir;
      updateClasses(dir);
    },
    destroy() {
      // Cleanup when component is destroyed
      node.classList.remove('rtl', 'ltr');
      node.removeAttribute('dir');
    }
  };
};

/**
 * Svelte action to automatically flip icons based on direction
 * Usage: <svg use:flipForRtl={{ dir: currentDir }} class="transform">
 */
export const flipForRtl: RtlAction = (node, initialDirection) => {
  let currentDirection: RtlDirection = initialDirection;

  const updateFlip = (dir: RtlDirection) => {
    if (dir === 'rtl') {
      // Add flip transformation for RTL
      node.style.transform = 'scaleX(-1)';
    } else {
      // Reset transformation for LTR
      node.style.transform = '';
    }
  };

  updateFlip(currentDirection);

  return {
    update(dir: RtlDirection) {
      currentDirection = dir;
      updateFlip(dir);
    },
    destroy() {
      // Reset transformation when component is destroyed
      node.style.transform = '';
    }
  };
};

/**
 * Helper function to get direction-aware class names
 */
export function getRtlClass(baseClass: string, direction: RtlDirection, rtlClass?: string): string {
  if (direction === 'rtl' && rtlClass) {
    return rtlClass;
  }
  return baseClass;
}

/**
 * Helper to create a reactive RTL-aware component property
 */
export function createRtlAwareProperty<T>(
  baseValue: T,
  rtlValue: T,
  direction: RtlDirection
): T {
  return direction === 'rtl' ? rtlValue : baseValue;
}
