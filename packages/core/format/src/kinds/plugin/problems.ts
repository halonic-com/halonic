// How the plugin checks report: every message names the plugin, so a
// person with several plugins sees which one is wrong.
import type { Path } from "@halonicjs/schema-kit";
import type { KindCheckProblem } from "../../kind.ts";
import type { Plugin } from "./schema.ts";

/** An error in `plugin.yaml` at `path`. */
export function problem(
  plugin: Plugin,
  code: string,
  path: Path,
  message: string,
): KindCheckProblem {
  return { severity: "error", code, path, message: `Plugin "${plugin.id}": ${message}` };
}

/** A `duplicate` problem for every value after its first, at the path of that value. */
export function duplicates(
  plugin: Plugin,
  values: readonly string[],
  pathOf: (index: number) => Path,
  what: string,
): KindCheckProblem[] {
  const seen = new Set<string>();
  const problems: KindCheckProblem[] = [];
  values.forEach((value, index) => {
    if (seen.has(value)) {
      problems.push(
        problem(plugin, "duplicate", pathOf(index), `${what} ${value} is listed twice`),
      );
    }
    seen.add(value);
  });
  return problems;
}

/** Where a name is declared, as a person reads it, such as `the backend` or `local tool "files"`. */
export interface Declared {
  readonly name: string;
  readonly part: string;
  readonly path: Path;
}

/**
 * A `<code>` problem for a name declared in two parts, at each later part.
 * A name twice in one part is that part's own `duplicate`.
 */
export function inTwoParts(
  plugin: Plugin,
  declared: readonly Declared[],
  code: string,
  what: string,
): KindCheckProblem[] {
  const firstPart = new Map<string, string>();
  const problems: KindCheckProblem[] = [];
  for (const entry of declared) {
    const earlier = firstPart.get(entry.name);
    if (earlier === undefined) {
      firstPart.set(entry.name, entry.part);
    } else if (earlier !== entry.part) {
      const message = `${what} ${entry.name} is in ${earlier} and in ${entry.part}; give each its own name`;
      problems.push(problem(plugin, code, entry.path, message));
    }
  }
  return problems;
}

/** Every tool the plugin declares, backend first, then each local tool in order. */
export function declaredTools(plugin: Plugin): (Declared & { readonly risk: string })[] {
  const tools: (Declared & { readonly risk: string })[] = [];
  plugin.backend?.tools.forEach((tool, index) => {
    const path = ["backend", "tools", index, "name"];
    tools.push({ name: tool.name, risk: tool.risk, part: "the backend", path });
  });
  plugin.localTools?.forEach((localTool, toolIndex) => {
    localTool.tools.forEach((tool, index) => {
      const path = ["localTools", toolIndex, "tools", index, "name"];
      tools.push({ name: tool.name, risk: tool.risk, part: `local tool "${localTool.id}"`, path });
    });
  });
  return tools;
}

/** Every secret the plugin declares, the backend's first, then each local tool's. */
export function declaredSecrets(plugin: Plugin): Declared[] {
  const secrets: Declared[] = Object.keys(plugin.backend?.secrets ?? {}).map((name) => ({
    name,
    part: "the backend",
    path: ["backend", "secrets", name],
  }));
  plugin.localTools?.forEach((localTool, index) => {
    for (const name of Object.keys(localTool.secrets)) {
      const path = ["localTools", index, "secrets", name];
      secrets.push({ name, part: `local tool "${localTool.id}"`, path });
    }
  });
  return secrets;
}
