// Reads the package a package-runner connector names, such as
// `@acme/mail-mcp@2.3.1` for `npx` or `mail-mcp==2.3.1` for `uvx`, as
// `app.connector-pin-spec` asks. Only one exact version is accepted; the
// version rules are the pin's, in `connector-pin.ts`.

import { err, ok, type Result } from "@halonicjs/std";
import {
  checkExactVersion,
  checkPackageName,
  type PinnedPackage,
  type PinRegistry,
} from "./connector-pin.ts";

/** Joins a name and a version, as each registry's runner writes it. */
const separators: Record<PinRegistry, string> = { npm: "@", pypi: "==" };

const exampleVersion = "2.3.1";

/**
 * Reads a package spec as a command names it: `name@1.2.3` for npm,
 * `name==1.2.3` for PyPI. Only one exact version is accepted. A spec without
 * a version, with a tag (`latest`, `next`) or a range (`^2.3.1`, `>=2`,
 * `1.x`, `==1.*`), or one that points at a URL, a git source, a local path
 * or an npm alias is refused with a reason for a person to read.
 *
 * @example
 * readPackageSpec("npm", "@acme/mail-mcp@2.3.1"); // ok({ package: "@acme/mail-mcp", version: "2.3.1" })
 * readPackageSpec("pypi", "mail-mcp>=2"); // err('"mail-mcp>=2" names a range, …')
 */
export function readPackageSpec(
  registry: PinRegistry,
  spec: string,
): Result<PinnedPackage, string> {
  const source = describeSource(registry, spec);
  if (source !== undefined) {
    return err(`"${spec}" ${source}, not a package from the registry at an exact version`);
  }
  const split = registry === "npm" ? splitNpmSpec(spec) : splitPypiSpec(spec);
  if (!split.ok) {
    return err(`"${spec}" ${split.error}`);
  }
  const { name, version } = split.value;
  const named = checkPackageName(registry, name);
  if (!named.ok) {
    return named;
  }
  if (version === "") {
    const example = `${name}${separators[registry]}${exampleVersion}`;
    return err(
      `"${spec}" names no version, so it would start whatever is newest; pin one, such as ${example}`,
    );
  }
  const exact = checkExactVersion(registry, version);
  if (!exact.ok) {
    return exact;
  }
  return ok({ package: name, version });
}

/** Says what a spec points at when it isn't a registry package, or `undefined` when it is one. */
function describeSource(registry: PinRegistry, spec: string): string | undefined {
  const text = spec.trim().toLowerCase();
  if (/(?:^|[@\s])git(?:\+[a-z]+)?:|^(?:github|gitlab|bitbucket|gist):|\.git(?:#.*)?$/.test(text)) {
    return "is a git source";
  }
  if (/[a-z][a-z0-9+.-]*:\/\//.test(text)) {
    return "is a URL";
  }
  if (/^(?:file:|link:|\.{1,2}[/\\]|[/\\~]|[a-z]:[/\\])/.test(text)) {
    return "is a local path";
  }
  if (registry === "npm" && /(?:^|@)npm:/.test(text)) {
    return "is an alias for another package";
  }
  // npm reads `owner/repo` as a GitHub repository.
  if (registry === "npm" && /^[^@][^/]*\//.test(text)) {
    return "is a git source";
  }
  return undefined;
}

interface SplitSpec {
  readonly name: string;
  readonly version: string;
}

/** Splits `name@version` or `@scope/name@version` at the `@` after the name. */
function splitNpmSpec(spec: string): Result<SplitSpec, string> {
  const at = spec.indexOf("@", spec.startsWith("@") ? 1 : 0);
  if (at === -1) {
    return ok({ name: spec, version: "" });
  }
  return ok({ name: spec.slice(0, at), version: spec.slice(at + 1) });
}

/** Splits `name==version`. Anything else after the name is refused with its reason. */
function splitPypiSpec(spec: string): Result<SplitSpec, string> {
  const match = /^([A-Za-z0-9][A-Za-z0-9._-]*)(\[[^\]]*\])?\s*(.*)$/s.exec(spec);
  const name = match?.[1] ?? "";
  const extras = match?.[2];
  const rest = match?.[3] ?? spec;
  if (name === "" || /^[;@]/.test(rest)) {
    return err(`isn't written as name==version, such as mail-mcp==${exampleVersion}`);
  }
  if (extras !== undefined) {
    return err("names extras, which a pin can't hold");
  }
  if (rest === "") {
    return ok({ name, version: "" });
  }
  if (rest.startsWith("===")) {
    return err("uses ===, which compares text instead of versions; use ==");
  }
  if (!/^[<>=!~]/.test(rest)) {
    return err(`isn't written as name==version, such as ${name}==${exampleVersion}`);
  }
  if (!rest.startsWith("==") || rest.includes(",")) {
    return err("names a range, which can match more than one version; use ==");
  }
  return ok({ name, version: rest.slice(2).trim() });
}
