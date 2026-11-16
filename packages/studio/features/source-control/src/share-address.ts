/**
 * Whether `text` is a git address the shell accepts for a share address: `https://host/path`,
 * `ssh://host/path` or `user@host:path`. The shell checks the same rules again before git
 * starts (`remote add`); this check lets the dialog say so without asking it.
 *
 * @example
 * isShareAddress("https://github.com/acme/agents.git"); // true
 * isShareAddress("git@github.com:acme/agents.git"); // true
 * isShareAddress("/srv/agents.git"); // false
 */
export function isShareAddress(text: string): boolean {
  if (text === "" || text.startsWith("-") || text.includes("::")) return false;
  if (![...text].every((character) => character > " " && character <= "~")) return false;
  for (const scheme of ["https://", "ssh://"]) {
    if (text.startsWith(scheme)) return isAuthority(text.slice(scheme.length).split("/")[0] ?? "");
  }
  return isShortSshAddress(text);
}

/** The `user@host:port` part: ssh reads a part that starts with `-` as an option. */
function isAuthority(text: string): boolean {
  return (
    text !== "" &&
    !text.includes("%") &&
    text.split("@").every((part) => part !== "" && !part.startsWith("-"))
  );
}

function isShortSshAddress(text: string): boolean {
  const colon = text.indexOf(":");
  if (colon < 0) return false;
  const [user, host, ...more] = text.slice(0, colon).split("@");
  const path = text.slice(colon + 1);
  const isPlain = (part: string | undefined) => part !== undefined && /^[\w.][\w.-]*$/.test(part);
  return more.length === 0 && isPlain(user) && isPlain(host) && path !== "" && !path.includes("//");
}
