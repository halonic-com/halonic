import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadCases, type ParityCase } from "../cases.ts";
import type { FileRecording, OldDiagnostic, Recording } from "../recording.ts";

/** One file the old loader read in one fixture, with what it recorded for it. */
export interface FileCheck {
  /** "<case>: <file>", for test names. */
  readonly name: string;
  readonly caseId: string;
  /** The file on disk, relative to the workspace root. */
  readonly file: string;
  /** The file kind whose schema checked it; the case's kind when bad YAML stopped the schema. */
  readonly kind: string;
  readonly text: string;
  /** The id the old loader gave the file from its place; undefined where the place gives none. */
  readonly id: string | undefined;
  readonly recorded: FileRecording;
  /** Everything the old loader reported for the whole workspace. */
  readonly diagnostics: readonly OldDiagnostic[];
}

/** Kinds whose id doesn't come from their place: one file per workspace, or a test. */
const noPlaceId = new Set(["workspace", "deployments", "models", "workflowTest"]);

/** Kinds whose id is their folder (`hubs/<id>/hub.yaml`, `skills/<id>/SKILL.md`). */
const folderId = new Set(["hub", "skill"]);

/** The id the old loader gave a file from its place (784f78d: collect, the hub loop, collectSkills). */
export function placeIdOf(kind: string, file: string): string | undefined {
  const parts = file.split("/");
  if (folderId.has(kind)) {
    return parts.at(-2);
  }
  if (noPlaceId.has(kind)) {
    return undefined;
  }
  const name = parts.at(-1) ?? "";
  return name.replace(/(\.(agent|workflow|flow|test|routine|connector))?\.ya?ml$/, "");
}

function textOf(fixtures: string, parityCase: ParityCase, file: string): string {
  const own = parityCase.files.includes(file);
  const folder = own ? join(parityCase.folder, "files") : join(fixtures, "base", "files");
  return readFileSync(join(folder, file), "utf8");
}

function recordingOf(parityCase: ParityCase): Recording {
  return JSON.parse(readFileSync(join(parityCase.folder, "recorded.json"), "utf8")) as Recording;
}

/**
 * Every file the old loader read, in every fixture: the base's files and
 * each case's own files, in the fixtures' order. Files the old loader
 * skipped are left out: there is nothing of the old code's to compare.
 */
export function fileChecks(fixtures: string): FileCheck[] {
  const found: FileCheck[] = [];
  for (const parityCase of loadCases(fixtures)) {
    const recording = recordingOf(parityCase);
    for (const recorded of recording.files) {
      if (!recorded.read) {
        continue;
      }
      const kind = recorded.schema ?? parityCase.kind;
      found.push({
        name: `${parityCase.id}: ${recorded.file}`,
        caseId: parityCase.id,
        file: recorded.file,
        kind,
        text: textOf(fixtures, parityCase, recorded.file),
        id: placeIdOf(kind, recorded.file),
        recorded,
        diagnostics: recording.diagnostics,
      });
    }
  }
  return found;
}
