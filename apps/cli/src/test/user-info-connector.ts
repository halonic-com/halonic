/**
 * The parts of a connector address with user info. Each is distinctive, so a
 * test can show that none of them reaches any output: not the password, and
 * not the rest of the address either (HAL-5421). The password is short
 * because the leak guard reports any URL password of six characters or more.
 */
const address = {
  user: "leak-test-user",
  password: "Xq7z9",
  host: "leak-test-host.example.com",
} as const;

/** The connector's address, with the user and password before the host. */
function userInfoUrl(): string {
  const url = new URL("/mcp", `https://${address.host}`);
  url.username = address.user;
  url.password = address.password;
  return url.href;
}

/** A connector file whose URL has user info, so the trust check refuses it. */
export const userInfoConnectorYaml = [
  "name: Web",
  "transport:",
  "  http:",
  `    url: ${userInfoUrl()}`,
  "tools:",
  "  approve: []",
  "",
].join("\n");

/** The parts of the refused address that `output` holds; a test expects none. */
export function leakedAddressParts(output: readonly string[]): string[] {
  const text = output.join("\n");
  return Object.values(address).filter((part) => text.includes(part));
}
