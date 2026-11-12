import type { Connector } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";

/**
 * Computes the trust fingerprint of a workspace's connectors, as parsed from
 * the workspace files. The real one is in `core/workspace` (HAL-188); a
 * suite wraps it so it takes only the connectors.
 */
export type FingerprintConnectors = (connectors: readonly Connector[]) => Promise<string>;

/** One attacker edit: the workspace before and after it. */
export interface FingerprintCase {
  /** The item of the HAL-188 plan's "Fingerprint coverage" section it covers. */
  readonly item: "a" | "b" | "c" | "d" | "e" | "secrets" | "program" | "google";
  readonly before: readonly Connector[];
  readonly after: readonly Connector[];
}

const stdio = (fields: Partial<StdioFields> = {}, rest: Partial<Connector> = {}): Connector => ({
  version: 1,
  id: "files",
  transport: {
    stdio: { command: "node", args: ["server.js"], env: { MODE: "safe" }, cwd: ".", ...fields },
  },
  tools: { approve: ["delete_file"] },
  ...rest,
});

const http = (url = "https://mcp.acme.test/v1/mcp", rest: Partial<Connector> = {}): Connector => ({
  version: 1,
  id: "files",
  transport: { http: { url, headers: { accept: "application/json" } } },
  secret: "files-token",
  tools: { approve: ["delete_file"] },
  ...rest,
});

const google = (account = "office@acme.test"): Connector => ({
  version: 1,
  id: "mail",
  transport: { google: { account, client: "google" } },
  secret: "mail-refresh",
  tools: { approve: ["send_mail"] },
});

type StdioFields = Extract<Connector["transport"], { stdio: unknown }>["stdio"];

/** `${NAME}` as written in a workspace file, which Halonic never expands. */
const variable = (name: string) => `\${${name}}`;

const edit = (item: FingerprintCase["item"], before: Connector, after: Connector) => ({
  item,
  before: [before],
  after: [after],
});

/**
 * Edits an attacker can make to a trusted workspace's files. Each must change
 * the fingerprint, so Halonic asks again before anything starts.
 *
 * Two cases from HAL-684 can't be written yet, because the connector file
 * doesn't allow them: a tool's risk set in the workspace (there is no such
 * field) and an unknown key on a connector or tool entry (the schema is
 * strict). Add them here when the schema changes.
 */
export const fingerprintAttacks = {
  "adds NODE_OPTIONS to a program": edit(
    "a",
    stdio(),
    stdio({ env: { MODE: "safe", NODE_OPTIONS: "--require ./x.js" } }),
  ),
  "adds PYTHONSTARTUP to a program": edit(
    "a",
    stdio(),
    stdio({ env: { MODE: "safe", PYTHONSTARTUP: "./x.py" } }),
  ),
  "adds LD_PRELOAD to a program": edit(
    "a",
    stdio(),
    stdio({ env: { MODE: "safe", LD_PRELOAD: "./x.so" } }),
  ),
  "changes the value of a program's variable": edit(
    "a",
    stdio(),
    stdio({ env: { MODE: "unsafe" } }),
  ),
  "points a ${VAR} at another variable": edit(
    "a",
    stdio({ env: { MODE: "safe", DATA: variable("HOME") } }),
    stdio({ env: { MODE: "safe", DATA: variable("EVIL") } }),
  ),
  "sets NODE_OPTIONS from a secret": edit(
    "a",
    stdio(),
    stdio({ secretEnv: { NODE_OPTIONS: "files-token" } }),
  ),
  "takes a variable from the person's environment": edit(
    "a",
    stdio(),
    stdio({ inheritEnv: ["AWS_PROFILE"] }),
  ),
  "moves the program to another folder": edit("b", stdio(), stdio({ cwd: "./scripts" })),
  "moves the program to another folder through ..": edit(
    "b",
    stdio(),
    stdio({ cwd: "./tools/../scripts" }),
  ),
  "changes the path on the same host": edit("c", http(), http("https://mcp.acme.test/v1/admin")),
  "changes https to http on the same host": edit("c", http(), http("http://mcp.acme.test/v1/mcp")),
  "adds a port on the same host": edit("c", http(), http("https://mcp.acme.test:8443/v1/mcp")),
  "adds a query on the same host": edit("c", http(), http("https://mcp.acme.test/v1/mcp?as=admin")),
  "swaps the host for a look-alike": edit(
    "c",
    http(),
    // "асme" with a Cyrillic а and с: xn--me-6kc0f.test once in punycode.
    http("https://mcp.асme.test/v1/mcp"),
  ),
  "adds a header": edit("c", http(), {
    ...http(),
    transport: {
      http: {
        url: "https://mcp.acme.test/v1/mcp",
        headers: { accept: "application/json", "x-forward-to": "evil.test" },
      },
    },
  }),
  "switches the same connector from http to stdio": edit("d", http(), stdio()),
  "switches the same connector from stdio to http": edit("d", stdio(), http()),
  "stops asking before a tool runs": edit("e", stdio(), stdio({}, { tools: { approve: [] } })),
  "offers every tool instead of a list": edit(
    "e",
    stdio({}, { tools: { allow: ["read_file"], approve: [] } }),
    stdio({}, { tools: { approve: [] } }),
  ),
  "adds a tool to the offered list": edit(
    "e",
    stdio({}, { tools: { allow: ["read_file"], approve: [] } }),
    stdio({}, { tools: { allow: ["read_file", "delete_file"], approve: [] } }),
  ),
  "marks a remote server as local": edit("e", http(), http(undefined, { local: true })),
  "sends the token from another secret": edit(
    "secrets",
    http(),
    http(undefined, { secret: "admin-token" }),
  ),
  "changes the command": edit("program", stdio(), stdio({ command: "bash" })),
  "adds an argument": edit("program", stdio(), stdio({ args: ["server.js", "--allow-all"] })),
  "acts as another Google account": edit("google", google(), google("ceo@acme.test")),
  "adds a connector": {
    item: "program",
    before: [stdio()],
    after: [stdio(), { ...stdio({ command: "bash" }), id: "helper" }],
  },
} satisfies Record<string, FingerprintCase>;

/**
 * Edits that change nothing that runs or where it talks to. Each must keep
 * the fingerprint, so the attack cases can't pass by a fingerprint that
 * changes on every call.
 */
export const fingerprintControls = {
  "writes the same connector again": edit("program", stdio(), stdio()),
  "writes the keys in another order": edit("a", stdio(), {
    tools: { approve: ["delete_file"] },
    transport: {
      stdio: { cwd: ".", env: { MODE: "safe" }, args: ["server.js"], command: "node" },
    },
    id: "files",
    version: 1,
  }),
  "names the inherited variables in another order": edit(
    "a",
    stdio({ inheritEnv: ["AWS_PROFILE", "AWS_REGION"] }),
    stdio({ inheritEnv: ["AWS_REGION", "AWS_PROFILE"] }),
  ),
  "writes an empty list of inherited variables": edit("a", stdio(), stdio({ inheritEnv: [] })),
  "writes the same folder through ..": edit(
    "b",
    stdio({ cwd: "./scripts" }),
    stdio({ cwd: "./tools/../scripts" }),
  ),
  "writes the host in Unicode or in punycode": edit(
    "c",
    http("https://bücher.acme.test/v1/mcp"),
    http("https://xn--bcher-kva.acme.test/v1/mcp"),
  ),
  "writes the host in capitals": edit("c", http(), http("https://MCP.Acme.test/v1/mcp")),
  // Connectors can come from separate files, so their order can follow the
  // folder listing; tool lists are sets. Neither order decides anything.
  "lists the connectors in another order": {
    item: "program",
    before: [stdio(), { ...http(), id: "web" }],
    after: [{ ...http(), id: "web" }, stdio()],
  },
  "lists the tools in another order": edit(
    "e",
    stdio(
      {},
      { tools: { allow: ["read_file", "list_files"], approve: ["move_file", "delete_file"] } },
    ),
    stdio(
      {},
      { tools: { allow: ["list_files", "read_file"], approve: ["delete_file", "move_file"] } },
    ),
  ),
} satisfies Record<string, FingerprintCase>;

/**
 * The names of the attack cases a fingerprint misses, and of the controls it
 * fails, so a suite can show what a weak fingerprint lets through.
 */
export async function fingerprintGaps(
  fingerprint: FingerprintConnectors,
): Promise<{ missed: string[]; unstable: string[] }> {
  const same = async ({ before, after }: FingerprintCase) =>
    (await fingerprint(before)) === (await fingerprint(after));
  const missed: string[] = [];
  const unstable: string[] = [];
  for (const [name, edited] of Object.entries(fingerprintAttacks)) {
    if (await same(edited)) missed.push(name);
  }
  for (const [name, edited] of Object.entries(fingerprintControls)) {
    if (!(await same(edited))) unstable.push(name);
  }
  return { missed, unstable };
}

/**
 * The contract the trust fingerprint passes: every attacker edit in
 * {@link fingerprintAttacks} changes it, and no edit in
 * {@link fingerprintControls} does.
 */
export function fingerprintCoverageContract(
  name: string,
  fingerprint: FingerprintConnectors,
): void {
  verifies("contracts.trust-fingerprint", () => {
    describe(`Trust fingerprint contract: ${name}`, () => {
      for (const [attack, edited] of Object.entries(fingerprintAttacks)) {
        it(`changes when an attacker ${attack} (${edited.item})`, async () => {
          expect(await fingerprint(edited.after)).not.toBe(await fingerprint(edited.before));
        });
      }
      for (const [control, edited] of Object.entries(fingerprintControls)) {
        it(`stays the same when the workspace ${control}`, async () => {
          expect(await fingerprint(edited.after)).toBe(await fingerprint(edited.before));
        });
      }
    });
  });
}
