/** `https://host[:port]` exactly, with no path, query or trailing slash. */
export function isHttpsOrigin(text: string): boolean {
  if (!URL.canParse(text)) {
    return false;
  }
  const url = new URL(text);
  return url.protocol === "https:" && url.origin === text;
}
