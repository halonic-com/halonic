import { type Clock, portVersions, type Secrets } from "../src/index.ts";

/**
 * A port is an interface plus a version. This adapter satisfies the `Secrets`
 * port from a plain map, and the code that depends on the port never sees
 * the difference.
 */
class MapSecrets implements Secrets {
  // The port says names differing only in case or `-` versus `_` are the same secret.
  readonly #values = new Map<string, string>();

  constructor(values: Record<string, string>) {
    for (const [name, value] of Object.entries(values)) this.#values.set(this.#key(name), value);
  }

  #key(name: string): string {
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(name) || name.length > 128) {
      throw new RangeError(`not a valid secret name: ${name}`);
    }
    return name.toUpperCase().replaceAll("-", "_");
  }

  async get(name: string): Promise<string | null> {
    return this.#values.get(this.#key(name)) ?? null;
  }
}

/** Core logic takes ports as arguments: it can run against any adapter, and tests fix the clock. */
async function describeKey(secrets: Secrets, clock: Clock): Promise<string> {
  const key = await secrets.get("provider-key");
  return `${clock.now().toISOString()}: ${key === null ? "no key" : "key set"}`;
}

/** Runs one adapter through the port and returns what it printed. */
export async function runExample(): Promise<string[]> {
  const secrets = new MapSecrets({ PROVIDER_KEY: "not-a-real-key" });
  const clock: Clock = { now: () => new Date("2026-01-01T00:00:00.000Z") };

  // The version check: an adapter records which version of the port it was written against.
  if (portVersions.Secrets !== 1) throw new Error("this adapter implements Secrets 1");

  return [
    `Secrets is version ${portVersions.Secrets}`,
    await describeKey(secrets, clock), // case and `-` versus `_` don't matter
    await describeKey(new MapSecrets({}), clock), // an unset name is `null`, not an error
  ];
}
