// src/lib/utils/rtl-utils.ts
import type { RtlDirection } from '$lib/contexts/rtl-context';

/**
 * Determines the direction of a string based on its content
 * @param text The text to analyze
 * @returns The detected direction ('rtl' or 'ltr')
 */
export function detectTextDirection(text: string): RtlDirection {
  if (!text) return 'ltr';

  // Check for RTL characters (Arabic, Persian, Hebrew, etc.)
  const rtlPattern = /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

  // Count RTL and LTR characters
  const rtlChars = (text.match(rtlPattern) || []).length;
  const ltrChars = (text.match(/[a-zA-Z]/) || []).length;

  return rtlChars > ltrChars ? 'rtl' : 'ltr';
}

/**
 * Applies RTL-specific transformations to a string
 * @param text The text to transform
 * @param direction The target direction
 * @returns The transformed text (with RTL transformations if needed)
 */
export function applyRtlTransformation(text: string, direction: RtlDirection): string {
  if (direction === 'ltr') {
    return text;
  }

  // For Persian/Arabic text, we just return as is since Vazirmatn handles it
  // Add any specific transformations here if needed
  return text;
}

/**
 * Gets appropriate margin/padding class based on direction
 * @param baseClass The base margin/padding class
 * @param direction The current direction
 * @returns The appropriate class for the direction
 */
export function getDirectionalClass(baseClass: string, direction: RtlDirection): string {
  if (direction === 'ltr') {
    return baseClass;
  }

  // Replace LTR-specific classes with RTL equivalents
  return baseClass
    .replace(/\bml-(\d+)/g, 'mr-$1')  // margin-left to margin-right
    .replace(/\bmr-(\d+)/g, 'ml-$1')  // margin-right to margin-left
    .replace(/\bpl-(\d+)/g, 'pr-$1')  // padding-left to padding-right
    .replace(/\bpr-(\d+)/g, 'pl-$1'); // padding-right to padding-left
}

/**
 * Utility to get the opposite direction
 * @param direction Current direction
 * @returns Opposite direction
 */
export function getOppositeDirection(direction: RtlDirection): RtlDirection {
  return direction === 'ltr' ? 'rtl' : 'ltr';
}

/**
 * Calculates the appropriate transform for RTL animations
 * @param baseTransform The base transform value
 * @param direction The current direction
 * @returns The appropriate transform value
 */
export function getRtlTransform(baseTransform: string, direction: RtlDirection): string {
  if (direction === 'ltr') {
    return baseTransform;
  }

  // For RTL, we might want to flip certain transforms
  // For example, if baseTransform includes a horizontal offset, we might negate it
  return baseTransform.replace(/translateX\((-?\d+)([a-z%]+)\)/g,
    (_, value, unit) => `translateX(${-parseInt(value)}${unit})`);
}
