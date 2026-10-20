/** Joins class names, skipping falsy values. Small enough not to need a dependency. */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}
