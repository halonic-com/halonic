import { fileKinds, kindNames } from "@halonicjs/format";
import type { WorkspaceIssue } from "./load-workspace.ts";
import { placeMatches } from "./places.ts";

/** The code of the warning on a file the loader skips because it sits in the wrong place. */
export const misplacedFileCode = "misplaced-file";

const idToken = "<id>";
/** Stands for any hub in a path the message shows. */
const anyHub = "<hub>";
const hubPrefix = /^hubs\/[^/]+\//;
const yamlExtension = /\.ya?ml$/;

/**
 * A warning for a file no kind places but that is plainly meant as one: a
 * kind's file in the wrong scope, such as a provider inside a hub, or a YAML
 * file in a kind's folder whose name lacks the kind's suffix, such as
 * `agents/clerk.yaml`. Without it the loader would skip the file in silence
 * and the user would wonder why their agent never shows up. Other files,
 * such as a README or an old layout's folder, get no warning.
 *
 * @param path - a workspace-relative path that {@link placeMatches} doesn't place
 * @returns the warning, or `undefined` when the file isn't meant as a kind's
 *
 * @example
 * misplacedFile("hubs/billing/providers/openai.yaml")?.message;
 * // "Halonic reads this file only at the workspace root, as providers/openai.yaml"
 * misplacedFile("agents/clerk.yaml")?.message;
 * // "Halonic reads files in agents/ only when they're named <id>.agent.yaml: rename it to clerk.agent.yaml"
 */
export function misplacedFile(path: string): WorkspaceIssue | undefined {
  const message = wrongScope(path) ?? wrongName(path);
  if (message === undefined) {
    return undefined;
  }
  return {
    severity: "warning",
    source: "check",
    code: misplacedFileCode,
    path: [],
    message,
    file: path,
    line: 1,
    col: 1,
  };
}

/**
 * A file of a workspace-only kind inside a hub, or of a hub-only kind at the
 * root: where it would be read.
 */
function wrongScope(path: string): string | undefined {
  const inHub = hubPrefix.exec(path);
  if (inHub !== null) {
    const atRoot = path.slice(inHub[0].length);
    if (placeMatches(atRoot).length > 0) {
      return `Halonic reads this file only at the workspace root, as ${atRoot}`;
    }
    return undefined;
  }
  const inAnyHub = `hubs/${anyHub}/${path}`;
  if (placeMatches(inAnyHub).length > 0) {
    return `Halonic reads this file only inside a hub, as ${inAnyHub}`;
  }
  return undefined;
}

/** A YAML file in a kind's folder, in a scope the kind allows, whose name no kind there takes. */
function wrongName(path: string): string | undefined {
  const slash = path.lastIndexOf("/");
  const fileName = path.slice(slash + 1);
  if (slash < 0 || !yamlExtension.test(fileName)) {
    return undefined;
  }
  const folder = path.slice(0, slash);
  const names = namesInFolder(folder);
  if (names.length === 0) {
    return undefined;
  }
  const shownFolder = folder.replace(hubPrefix, "");
  const stem = fileName.replace(yamlExtension, "");
  const renamed = names.map((name) => name.replace(idToken, stem));
  return `Halonic reads files in ${shownFolder}/ only when they're named ${orList(names)}: rename it to ${orList(renamed)}`;
}

/**
 * The file names, such as `<id>.agent.yaml`, that the kinds take directly in
 * a workspace folder. A place whose name has no `<id>`, or spans folders as
 * `<id>/SKILL.md` does, gives none: a folder can't hold a misnamed one.
 */
function namesInFolder(folder: string): string[] {
  const inHub = hubPrefix.test(folder);
  const placeFolder = folder.replace(hubPrefix, "");
  return kindNames().flatMap((kind) =>
    fileKinds[kind].places
      .filter(
        (place) =>
          place.folder !== "" &&
          place.folder === placeFolder &&
          place.scope !== (inHub ? "workspace" : "hub") &&
          place.name.includes(idToken) &&
          !place.name.includes("/"),
      )
      .map((place) => place.name),
  );
}

/** "a", "a or b", "a, b or c". */
function orList(items: readonly string[]): string {
  if (items.length <= 1) {
    return items.join("");
  }
  return `${items.slice(0, -1).join(", ")} or ${items.at(-1)}`;
}
