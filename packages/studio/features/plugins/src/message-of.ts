/** A thrown value's message, for the person. */
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
