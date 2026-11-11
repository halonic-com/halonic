// A harness agent writes in its working folder from inside the sandbox. A
// local connector's program runs outside it, with the connector's secrets.
// If that program, or a file it reads, were in an agent's working folder,
// the agent could rewrite what runs outside the sandbox, and no change would
// be recorded for review (HAL-4732). So a working folder may not hold
// anything a local connector starts in or names.

import { type Connector, defaultWorkingFolder, isInWorkingFolder } from "@halonicjs/format";
import { posixPath } from "@halonicjs/std";
import type { LoadedFileOf, WorkspaceIssue } from "../load-workspace.ts";
import type { CheckContext } from "./check-context.ts";

/** A part of a local connector's start that may name a workspace path. */
interface StartPart {
  /** The path, relative to the workspace root. */
  readonly path: string;
  /** How the connector file writes it, for the message. */
  readonly shown: string;
}

/**
 * Harness agents whose working folder holds the folder a local connector
 * starts in, its program, or a path one of its arguments names, reported on
 * the agent's `workingFolder` once per connector. Every local connector
 * counts, pinned or not: a pinned program starts in a folder of its own, but
 * its arguments can still name a file it reads, such as its settings.
 */
export function checkWorkingFolders(context: CheckContext): WorkspaceIssue[] {
  const connectors = context.filesOf("connector");
  const issues: WorkspaceIssue[] = [];
  for (const agent of context.filesOf("agent").filter(runsInHarness)) {
    const folder = agent.value.workingFolder ?? defaultWorkingFolder(agent.value.id);
    for (const connector of connectors) {
      const part = startParts(connector.value).find((start) =>
        isInWorkingFolder(start.path, folder),
      );
      if (part !== undefined) {
        const message =
          `Agent "${agent.value.id}" can't write in '${folder}': connector ` +
          `"${connector.value.id}" runs '${part.shown}' from there, outside the sandbox`;
        issues.push(
          context.error(agent.path, ["workingFolder"], "working-folder-runs-program", message),
        );
      }
    }
  }
  return issues;
}

type AgentFile = LoadedFileOf<"agent">;

/** An agent that runs in Claude Code, Codex or another program, not in Halonic's own loop. */
function runsInHarness(agent: AgentFile): boolean {
  return agent.value.harness !== undefined && agent.value.harness !== "halonic";
}

/**
 * For a connector that starts a program on this computer: the folder it
 * starts in, its program and every argument, each read from that folder.
 * An argument's value after the first `=`, as in `--config=tools/mail.json`,
 * counts as a path of its own. A bare program name such as `node` reads as a
 * file in the start folder, so it is inside a working folder only when that
 * folder is. A connector that starts no program has no parts.
 */
function startParts(connector: Connector): StartPart[] {
  if (!("stdio" in connector.transport)) return [];
  const { cwd = ".", command, args } = connector.transport.stdio;
  const fromStart = (shown: string): StartPart => ({ path: inFolder(cwd, shown), shown });
  return [
    { path: cwd, shown: cwd },
    fromStart(command),
    ...args.map(fromStart),
    ...args.flatMap(joinedValue).map(fromStart),
  ];
}

/** `path` read from `folder`: an absolute path, in either slash style or with a drive, stays as it is. */
function inFolder(folder: string, path: string): string {
  return /^([\\/]|[a-z]:)/i.test(path) ? path : posixPath.join(folder, path);
}

/** The text after the first `=` of `--name=value`, or nothing. */
function joinedValue(arg: string): string[] {
  const equals = arg.indexOf("=");
  return equals === -1 ? [] : [arg.slice(equals + 1)];
}
