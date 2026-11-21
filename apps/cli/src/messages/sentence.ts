/** The text as a sentence: it keeps its own ".", "?" or "!", and gets a full stop if it has none. */
export function asSentence(text: string): string {
  return /[.?!]$/.test(text) ? text : `${text}.`;
}
