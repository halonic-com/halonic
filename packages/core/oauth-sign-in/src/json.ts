/** The text as JSON, or `undefined` when it isn't JSON (an HTML error page, say). */
export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
