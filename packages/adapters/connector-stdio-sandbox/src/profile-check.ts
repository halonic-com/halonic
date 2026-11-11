import type { SandboxProfile } from "@halonicjs/ports";
import { deepEqual } from "@halonicjs/std";

/**
 * The fields where the session's profile differs from the one Halonic built
 * for the local tool, by name only: `env` by the names of the variables
 * that differ, such as `env.ACME_TOKEN`, every other field by its own name.
 * Never a value: the environment holds the tool's secrets. Empty when they
 * are the same.
 */
export function profileDifferences(actual: SandboxProfile, expected: SandboxProfile): string[] {
  // Both sides' keys, so a field the session has and Halonic didn't build counts too.
  const fields = [
    ...new Set([...Object.keys(expected), ...Object.keys(actual)]),
  ] as (keyof SandboxProfile)[];
  return fields.flatMap((field) => {
    if (field === "env") return envDifferences(actual.env, expected.env);
    return deepEqual(actual[field], expected[field]) ? [] : [field];
  });
}

function envDifferences(
  actual: Readonly<Record<string, string>>,
  expected: Readonly<Record<string, string>>,
): string[] {
  const names = new Set([...Object.keys(actual), ...Object.keys(expected)]);
  return [...names]
    .filter((name) => actual[name] !== expected[name])
    .sort()
    .map((name) => `env.${name}`);
}
