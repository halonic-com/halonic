import type { Issue } from "@halonicjs/schema-kit";
import { isMap } from "../../shared/legacy-keys.ts";

/** The fields only a secret the integration places has, in the order a message names them. */
const placementKeys = ["hosts", "header", "field", "prefix"];

/**
 * Words the case a sheet most often gets wrong (HAL-15880): a `secrets` entry
 * with `hosts`, `header`, `field` or `prefix` and no `as`. Without `as` the
 * schema reads it as a sign-in's client secret, which has only `purpose`, so
 * the shared wording would say `There's no field "hosts"`, pointing away from
 * the fix. Such an entry gets one issue that says to add `as`; its other
 * issues stay as they are.
 *
 * @param issues - the sheet's issues, after the shared wording
 * @param data - the data the schema got
 *
 * @example
 * // secrets: { notes-key: { purpose: Notes API key, hosts: [api.example.com] } }
 * wordSecretIssues(issues, data).map((issue) => issue.message);
 * // ['Secret "notes-key" has hosts but no as, … Add as: bearer, …']
 */
export function wordSecretIssues(issues: readonly Issue[], data: unknown): Issue[] {
  const worded = new Set<string>();
  return issues.flatMap((issue): Issue[] => {
    const name = placementWithoutAs(issue, data);
    if (name === undefined) {
      return [issue];
    }
    if (worded.has(name)) {
      return []; // the entry's first placement key already says it
    }
    worded.add(name);
    const found = placementKeys.filter((key) => Object.hasOwn(entryOf(data, name) ?? {}, key));
    return [{ ...issue, keys: found, message: addAsMessage(name, found) }];
  });
}

/**
 * The secret's name, when the issue is a placement key the schema refused
 * because the entry has no `as`.
 */
function placementWithoutAs(issue: Issue, data: unknown): string | undefined {
  const [top, name] = issue.path;
  const key = issue.keys?.[0];
  if (
    issue.code !== "unrecognized_keys" ||
    issue.path.length !== 2 ||
    top !== "secrets" ||
    typeof name !== "string" ||
    key === undefined ||
    !placementKeys.includes(key)
  ) {
    return undefined;
  }
  const entry = entryOf(data, name);
  return entry !== undefined && !Object.hasOwn(entry, "as") ? name : undefined;
}

/** The `secrets` entry with this name, when it is a map. */
function entryOf(data: unknown, name: string): Readonly<Record<string, unknown>> | undefined {
  const secrets = isMap(data) ? data["secrets"] : undefined;
  const entry = isMap(secrets) && Object.hasOwn(secrets, name) ? secrets[name] : undefined;
  return isMap(entry) ? entry : undefined;
}

/** What to do about a secret with placement fields and no `as`. */
function addAsMessage(name: string, found: readonly string[]): string {
  const fields =
    found.length > 1 ? `${found.slice(0, -1).join(", ")} and ${found.at(-1)}` : found.join("");
  return (
    `Secret "${name}" has ${fields} but no as, so it reads as a sign-in's client secret, which has only purpose. ` +
    "Add as: bearer, as: header (with header) or as: form (with field) to say how the kit sends it."
  );
}
