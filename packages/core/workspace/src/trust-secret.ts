/**
 * Shows a secret by name only. A secret's value never goes into the trust
 * content.
 *
 * @example
 * secretReference("weather-key"); // "‹secret weather-key›"
 */
export function secretReference(name: string): string {
  return `‹secret ${name}›`;
}
