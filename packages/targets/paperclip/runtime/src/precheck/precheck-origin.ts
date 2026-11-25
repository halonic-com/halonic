/**
 * Where `halonic.precheck` sends its requests. The address comes only from
 * the plugin's settings, which the installer sets, never from the workspace:
 * a tool file that could name it could send branch names and the worker's
 * requests to any host. The plain `fetch` the service client uses skips the
 * host's outbound guard, so this check does that guard's job: it allows a
 * scheme, a host and a port, and nothing that could change where a request
 * lands once a path is added.
 */

/** Where the service listens when the settings name no other address. */
export const defaultPrecheckUrl = "http://halonic-precheck:8787";

/** The setting's schema, for the manifest the builder writes. */
export const precheckSettingProperties = {
  precheckUrl: {
    type: "string",
    title: "Precheck service",
    description: `The address of Halonic's precheck service, as http(s)://host or http(s)://host:port, with no path. Empty: ${defaultPrecheckUrl}.`,
  },
} as const;

/** The service's origin, or why the setting is refused. */
export type PrecheckOrigin = { readonly origin: string } | { readonly refused: string };

/** Why a parsed address isn't a bare origin, or undefined when it is. */
function notBareOrigin(text: string, url: URL): string | undefined {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return "it must start with http:// or https://";
  }
  // `new URL` drops an empty `?`, `#` or `user@`, so the raw text is checked too.
  if (url.username !== "" || url.password !== "" || text.includes("@")) {
    return "it must not hold a user or a password";
  }
  if (url.search !== "" || text.includes("?")) {
    return "it must not hold a query";
  }
  if (url.hash !== "" || text.includes("#")) {
    return "it must not hold a fragment";
  }
  if (url.pathname !== "/") {
    return "it must not hold a path";
  }
  return undefined;
}

/**
 * Reads the `precheckUrl` setting once, when the settings load. Requests
 * are then built as this origin plus a fixed path, so the setting can only
 * name a host.
 *
 * @example
 * precheckOrigin({ precheckUrl: "http://precheck.acme.test:8787" }); // { origin: "http://precheck.acme.test:8787" }
 * precheckOrigin({ precheckUrl: "http://precheck.acme.test/x" }); // { refused: "… it must not hold a path" }
 */
export function precheckOrigin(config: Readonly<Record<string, unknown>>): PrecheckOrigin {
  const setting = config["precheckUrl"];
  const text = typeof setting === "string" ? setting.trim() : "";
  const chosen = text === "" ? defaultPrecheckUrl : text;
  let url: URL;
  try {
    url = new URL(chosen);
  } catch {
    return { refused: "the plugin's precheckUrl setting isn't an address" };
  }
  const problem = notBareOrigin(chosen, url);
  return problem === undefined
    ? { origin: url.origin }
    : { refused: `the plugin's precheckUrl setting is refused: ${problem}` };
}
