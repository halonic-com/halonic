import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";

/**
 * What a target that can't change what runs hands the capability suite: its
 * ports as wired, under the names it uses for them.
 */
export interface TargetCapabilityHarness {
  /** Every port the target wired, by name: `Object.keys` of what it builds from its configuration. */
  wiredPorts: object;
  /** The definitions the target hands out. */
  definitions: object;
  /** The secrets the target hands out. */
  secrets: object;
}

/** Makes the target's ports as it wires them, with what it was configured with. */
export type MakeTargetCapabilityHarness = () => Promise<TargetCapabilityHarness>;

/** A capability a target refuses, and the methods or ports that would give it. */
interface Refusal {
  /** The capability as multi-cloud ADR 5.5 names it. */
  readonly capability: string;
  /** Ports that must not be wired at all. */
  readonly ports: readonly string[];
}

/**
 * The ports behind the capabilities a cloud target declares as `false`
 * (multi-cloud ADR 5.5): `startPrograms` needs a sandbox and `git` needs
 * version control. The names are the ones the ports have in `@halonicjs/ports`.
 */
export const refusedPortNames: readonly Refusal[] = [
  { capability: "startPrograms", ports: ["sandbox", "harness", "connectors"] },
  { capability: "git", ports: ["vcs", "versions"] },
];

/** Methods that change the files a deployment runs: the write side of `DefinitionStore`. */
export const definitionWriteMethods: readonly string[] = ["write", "remove", "watch"];

/** Methods that change a secret: the write side of `SecretStore`. */
export const secretWriteMethods: readonly string[] = ["set", "remove", "names"];

/** The write methods in `methodNames` that `holder` has, wherever it inherits them from. */
export function presentMethods(holder: object, methodNames: readonly string[]): string[] {
  return methodNames.filter((name) => name in holder);
}

/** The wired ports in `wiredPorts` whose names are refused. */
export function wiredRefusedPorts(wiredPorts: object): string[] {
  const wired = Object.keys(wiredPorts);
  return refusedPortNames.flatMap(({ ports }) => ports.filter((port) => wired.includes(port)));
}

/**
 * The capability refusals of a target that can't start programs, use git,
 * edit its files or set its secrets (multi-cloud ADR 5.5, group
 * "Capabilities", the part that doesn't need `host/server`): the ports for
 * those capabilities aren't wired, the definitions have no write side, and
 * the secrets can only be read. A stolen session can't change what runs
 * because there is nothing to call.
 *
 * Refusal at validation time and at run time (`capability-missing`) is
 * tested with `host/server` (HAL-195).
 */
export function targetCapabilityRefusals(
  targetName: string,
  harness: TargetCapabilityHarness,
): void {
  verifies("contracts.target-capabilities", () => {
    describe(`Target capability refusals: ${targetName}`, () => {
      it("wires no port for a capability it refuses", async () => {
        const { wiredPorts } = await make();
        expect(wiredRefusedPorts(wiredPorts)).toEqual([]);
      });

      it("hands out definitions that can't be written, removed or watched", async () => {
        const { definitions } = await make();
        expect(presentMethods(definitions, definitionWriteMethods)).toEqual([]);
        expect("read" in definitions).toBe(true);
      });

      it("hands out secrets that can only be read", async () => {
        const { secrets } = await make();
        expect(presentMethods(secrets, secretWriteMethods)).toEqual([]);
        expect("get" in secrets).toBe(true);
      });
    });
  });
}
