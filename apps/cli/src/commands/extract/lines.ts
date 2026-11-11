import type { ExtractedHub, ExtractPart } from "@halonicjs/workspace";
import { extractMessages } from "../../messages/extract.ts";
import { initMessages } from "../../messages/init.ts";
import { markPart, type Phrase, phrase } from "../../messages/phrase.ts";
import { nextSteps } from "../../output/next-steps.ts";
import { printable } from "../../output/printable.ts";
import { shellWord } from "../../output/shell-word.ts";
import type { WorkspaceDir } from "../../workspace-dir.ts";

/** The new workspace's folder, as the file system and the user each see it. */
export interface ExtractFolder {
  /** The full path. */
  readonly root: string;
  /** As the user would type it from here, such as `./family`. */
  readonly shown: string;
  /** Relative to here, for the `cd` in `Next:`. */
  readonly typed: string;
}

/** One file of the new workspace, with the part it belongs to. */
export interface FileOfPart {
  readonly path: string;
  readonly part: ExtractPart;
}

/** Where the files went and came from, and whether they were written. */
export interface ExtractedContext {
  readonly folder: ExtractFolder;
  readonly source: WorkspaceDir;
  readonly dryRun: boolean;
}

const parts: readonly ExtractPart[] = ["hub", "shared", "workspace"];

/**
 * Every file of the new workspace in the order it is written, with its part.
 * A file the plan doesn't list, the new `.gitignore` or `workspace.yaml`, is
 * a workspace file.
 */
export function partsOf(extracted: ExtractedHub): FileOfPart[] {
  const planned = new Map(extracted.plan.files.map((file) => [file.path, file.part]));
  return extracted.files.map((path) => ({ path, part: planned.get(path) ?? "workspace" }));
}

/**
 * The lines of a done extract (the ✓ line, the counts, the shared items and
 * the `Next:` block), or of a dry run (the files by part, and how to write them).
 */
export function extractedLines(
  extracted: ExtractedHub,
  files: readonly FileOfPart[],
  context: ExtractedContext,
): Phrase[] {
  return context.dryRun
    ? dryRunLines(extracted, files, context)
    : doneLines(extracted, files, context);
}

function doneLines(
  extracted: ExtractedHub,
  files: readonly FileOfPart[],
  { folder, source }: ExtractedContext,
): Phrase[] {
  const { plan } = extracted;
  const done = extractMessages.extracted(
    printable(plan.settings.name),
    printable(folder.shown),
    printable(source.name),
  );
  const count = (part: ExtractPart) => files.filter((file) => file.part === part).length;
  const counts = { hub: count("hub"), shared: count("shared"), workspace: count("workspace") };
  const hasShared = Object.values(plan.uses).some((ids) => ids.length > 0);
  return [
    phrase`${markPart("done")} ${done.phrase}`,
    phrase`  ${extractMessages.counts(counts).phrase}`,
    ...(hasShared ? [phrase`  ${extractMessages.shared(plan.uses).phrase}`] : []),
    ...nextSteps(
      [
        { command: initMessages.nextChangeFolder(shellWord(folder.typed)).phrase },
        {
          command: extractMessages.nextValidate().phrase,
          why: extractMessages.nextValidateWhy().phrase,
        },
        { command: extractMessages.nextTrust().phrase, why: extractMessages.nextTrustWhy().phrase },
      ],
      extractMessages.nextRemove(plan.hub, printable(source.name)).phrase,
    ),
  ];
}

function dryRunLines(
  extracted: ExtractedHub,
  files: readonly FileOfPart[],
  { folder }: ExtractedContext,
): Phrase[] {
  const headings = {
    hub: extractMessages.partHub(),
    shared: extractMessages.partShared(),
    workspace: extractMessages.partWorkspace(),
  };
  const lines: Phrase[] = [
    extractMessages.wouldExtract(printable(extracted.plan.settings.name), printable(folder.shown))
      .phrase,
  ];
  for (const part of parts) {
    const ofPart = files.filter((file) => file.part === part);
    if (ofPart.length === 0) {
      continue;
    }
    lines.push([], headings[part].phrase, ...ofPart.map((file) => fileLine(file.path)));
  }
  lines.push([], extractMessages.dryRunAgain().phrase);
  return lines;
}

/** One path in the dry run's list; `workspace.yaml` says what changes in it. */
function fileLine(path: string): Phrase {
  const shown = printable(path);
  return path === "workspace.yaml"
    ? phrase`  ${shown} ${extractMessages.newSettings().phrase}`
    : phrase`  ${shown}`;
}
