import { type FilePlace, fileKinds, kindNames } from "@halonicjs/format";
import type { WorkspaceIssue } from "./load-workspace.ts";
import { placeMatches } from "./places.ts";

/** The code of the warning on a file the loader skips because it sits in the wrong place. */
export const misplacedFileCode = "misplaced-file";

const idToken = "<id>";
/** Stands for any hub in a path the message shows. */
const anyHub = "<hub>";
const hubPrefix = /^hubs\/[^/]+\//;
const yamlExtension = /\.ya?ml$/;
const ymlExtension = ".yml";
/** The hub's own file, which makes its folder a hub. */
const hubFileName = "hub.yaml";

/**
 * A warning for a file no kind places but that is plainly meant as one: a
 * kind's file saved as `.yml`, such as `models.yml`; a kind's file in the
 * wrong scope, such as a provider inside a hub; a file named as a kind's in
 * a folder that kind isn't read from, such as `notes/hub.yaml` or
 * `hubs/notes/routines/digest.routine.yaml`; or a YAML file in a kind's
 * folder whose name lacks the kind's suffix, such as `agents/clerk.yaml`.
 * Without it the loader would skip the file in silence and the user would
 * wonder why their agent never shows up. Other files, such as a README or
 * an old layout's folder, get no warning.
 *
 * @param path - a workspace-relative path that {@link placeMatches} doesn't place
 * @returns the warning, or `undefined` when the file isn't meant as a kind's
 *
 * @example
 * misplacedFile("models.yml")?.message;
 * // "Halonic reads models.yaml, not models.yml: rename it"
 * misplacedFile("hubs/billing/providers/openai.yaml")?.message;
 * // "Halonic reads this file only at the workspace root, as providers/openai.yaml"
 * misplacedFile("notes/hub.yaml")?.message;
 * // "Halonic reads hub.yaml only in hubs/<id>/: move notes/ to hubs/notes/"
 * misplacedFile("agents/clerk.yaml")?.message;
 * // "Halonic reads files in agents/ only when they're named <id>.agent.yaml: rename it to clerk.agent.yaml"
 */
export function misplacedFile(path: string): WorkspaceIssue | undefined {
  const message = ymlName(path) ?? wrongScope(path) ?? wrongFolder(path) ?? wrongName(path);
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
 * A file Halonic would read if it ended in `.yaml` rather than `.yml`, such
 * as `models.yml` or `agents/announcer.agent.yml`: its name with `.yaml`.
 */
function ymlName(path: string): string | undefined {
  if (!path.endsWith(ymlExtension)) {
    return undefined;
  }
  const yamlPath = `${path.slice(0, -ymlExtension.length)}.yaml`;
  if (placeMatches(yamlPath).length === 0) {
    return undefined;
  }
  return `Halonic reads ${fileNameOf(yamlPath)}, not ${fileNameOf(path)}: rename it`;
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

/**
 * A file named as one kind's, such as `announcer.agent.yaml` or `hub.yaml`
 * (or the same with `.yml`), in a folder that kind isn't read from: where
 * it goes. A kind whose files are named only `<id>.yaml`, such as a
 * provider, isn't told apart from any other YAML file, so it gets no warning
 * here.
 */
function wrongFolder(path: string): string | undefined {
  const slash = path.lastIndexOf("/");
  const folder = slash < 0 ? "" : path.slice(0, slash);
  const fileName = path.slice(slash + 1).replace(yamlExtension, ".yaml");
  if (fileName === hubFileName) {
    return hubOutsideHubs(folder);
  }
  const place = namedPlaces().find((each) => isNamedFor(fileName, each));
  if (place === undefined) {
    return undefined;
  }
  const target = `${scopeFolder(folder, place)}${place.folder}/${fileName}`;
  return `Halonic reads ${place.name} files only in ${place.folder}/: move it to ${target}`;
}

/** Where a `hub.yaml` outside `hubs/<id>/` goes: its folder, moved into `hubs/`. */
function hubOutsideHubs(folder: string): string {
  const where = `Halonic reads ${hubFileName} only in hubs/<id>/`;
  if (folder === "") {
    return where;
  }
  const hubId = folder.slice(folder.lastIndexOf("/") + 1);
  return `${where}: move ${folder}/ to hubs/${hubId}/`;
}

/**
 * The places whose file name tells their kind apart, such as
 * `<id>.agent.yaml`: an `<id>` and a suffix of the kind's own before
 * `.yaml`, in a folder.
 */
function namedPlaces(): FilePlace[] {
  return kindNames().flatMap((kind) =>
    fileKinds[kind].places.filter(
      (place) =>
        place.folder !== "" &&
        place.name.startsWith(`${idToken}.`) &&
        place.name !== `${idToken}.yaml` &&
        !place.name.includes("/"),
    ),
  );
}

/** Whether a file name is an id followed by the place's suffix, as `clerk.agent.yaml` is for `<id>.agent.yaml`. */
function isNamedFor(fileName: string, place: FilePlace): boolean {
  const suffix = place.name.slice(idToken.length);
  return fileName.length > suffix.length && fileName.endsWith(suffix);
}

/**
 * The start of the path a kind's file goes to: its hub's folder when it sits
 * in one, or in a hub's folder that is outside `hubs/` (such as
 * `notes/agents/`), or the workspace root.
 */
function scopeFolder(folder: string, place: FilePlace): string {
  if (place.scope === "workspace") {
    return "";
  }
  const inHub = hubPrefix.exec(`${folder}/`);
  if (inHub !== null) {
    return inHub[0];
  }
  const kindFolder = `/${place.folder}`;
  if (folder.endsWith(kindFolder)) {
    const hubFolder = folder.slice(0, -kindFolder.length);
    if (!hubFolder.includes("/")) {
      return `hubs/${hubFolder}/`;
    }
  }
  return place.scope === "hub" ? `hubs/${anyHub}/` : "";
}

/** A YAML file in a kind's folder, in a scope the kind allows, whose name no kind there takes. */
function wrongName(path: string): string | undefined {
  const slash = path.lastIndexOf("/");
  const fileName = fileNameOf(path);
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

/** The last part of a path: `models.yaml` for `models.yaml`, `clerk.agent.yaml` for `agents/clerk.agent.yaml`. */
function fileNameOf(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** "a", "a or b", "a, b or c". */
function orList(items: readonly string[]): string {
  if (items.length <= 1) {
    return items.join("");
  }
  return `${items.slice(0, -1).join(", ")} or ${items.at(-1)}`;
}
