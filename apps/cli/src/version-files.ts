// The agents' and skills' files of the version a run reads, as one load read
// them (HAL-6477). The "On this computer" choice holds for an agent file's
// exact bytes, so the choice is checked against the file of the version that
// runs, never the file on disk now: `halonic run` and `halonic runs send` keep
// the load their run starts from, `halonic routines watch` the load of each
// run's version.

import {
  agentFileIn as engineAgentFileIn,
  skillTextIn as engineSkillTextIn,
  type LoadedVersion,
  loadVersion,
} from "@halonicjs/adapter-workspace-engine-node";
import type { RunVersion } from "@halonicjs/events";
import { encodeUtf8 } from "@halonicjs/std";
import { type LoadedFileOf, VersionSource } from "@halonicjs/workspace";
import { plainText } from "./messages/phrase.ts";
import { routinesMessages } from "./messages/routines.ts";
import type { OpenWorkspaceHistory } from "./run-workspace.ts";
import { inCliWords } from "./version-refusal-words.ts";
import type { OpenWorkspaceDir } from "./workspace-dir.ts";
import type { WorkspaceVersions } from "./workspace-versions.ts";

// The loads live in the workspace engine, which the watch's versions read through (HAL-17054).
export {
  type LoadedVersion,
  loadVersion,
  versionWithTexts,
} from "@halonicjs/adapter-workspace-engine-node";

/**
 * The agent's file in `loaded`, as UTF-8 bytes of the text the load read.
 *
 * @param found - hears the agent's loaded file before its bytes are read, such as a check that refuses it
 * @throws Error when the version has no such agent file
 */
export function agentFileIn(
  loaded: LoadedVersion,
  hubId: string,
  agentId: string,
  found?: (file: LoadedFileOf<"agent">) => void,
): Uint8Array {
  try {
    return engineAgentFileIn(loaded, hubId, agentId, found);
  } catch (error) {
    throw inCliWords(error);
  }
}

/**
 * A skill's `SKILL.md` text in `loaded`, found as the hub sees the skill: its
 * own, else the shared one.
 *
 * @throws Error when the version has no such skill
 */
export function skillTextIn(loaded: LoadedVersion, hubId: string, skillId: string): string {
  try {
    return engineSkillTextIn(loaded, hubId, skillId);
  } catch (error) {
    throw inCliWords(error);
  }
}

/**
 * The agents' and skills' files of a run's version: the harness host checks
 * "On this computer" against the agent's file and pins the skills' text the
 * run starts with (HAL-16386).
 */
export type RunFiles = Pick<WorkspaceVersions, "agentFileOf" | "skillTextOf">;

/**
 * The agents' and skills' files of the version a command's run reads, for
 * `halonic run` and `halonic runs send`: the load the command started from.
 * A run that recorded another version, such as a waiting run started before
 * the last commit, has its own version loaded once, so its agents' and
 * skills' files are the ones its steps run with. A run that names no version
 * reads the command's.
 *
 * @example
 * const files = new CommandRunFiles(dir, { version, loaded }, openGitHistory);
 * await files.agentFileOf(run, "support", "writer"); // the bytes the choice is checked against
 */
export class CommandRunFiles implements RunFiles {
  readonly #dir: OpenWorkspaceDir;
  readonly #openHistory: OpenWorkspaceHistory;
  readonly #first: { readonly version: RunVersion; readonly loaded: LoadedVersion };
  /** The last other version loaded, by its commit, so one run's agents load it once. */
  #other: { readonly commit: string; readonly loaded: Promise<LoadedVersion> } | undefined;

  /**
   * @param first - the version the command loaded, and its files
   * @param openHistory - opens the history for a run of another commit
   */
  constructor(
    dir: OpenWorkspaceDir,
    first: { readonly version: RunVersion; readonly loaded: LoadedVersion },
    openHistory: OpenWorkspaceHistory,
  ) {
    this.#dir = dir;
    this.#first = first;
    this.#openHistory = openHistory;
  }

  /**
   * An agent's or skill's file in the command's own load, by its
   * workspace-relative path, for the sandbox check before the run starts.
   *
   * @throws Error when the load has no such file
   */
  async loadedFile(path: string): Promise<Uint8Array> {
    const text = this.#first.loaded.fileTexts.get(path);
    if (text === undefined) {
      throw new Error(`The version this run reads has no file ${path}.`);
    }
    return encodeUtf8(text);
  }

  /** @throws when the run's version can't be read or has no such agent file */
  async agentFileOf(
    run: { readonly runId: string; readonly version: RunVersion | null },
    hubId: string,
    agentId: string,
  ): Promise<Uint8Array> {
    return agentFileIn(await this.#loadedAt(run.version), hubId, agentId);
  }

  /** @throws when the run's version can't be read or has no such skill */
  async skillTextOf(
    run: { readonly runId: string; readonly version: RunVersion | null },
    hubId: string,
    skillId: string,
  ): Promise<string> {
    return skillTextIn(await this.#loadedAt(run.version), hubId, skillId);
  }

  async #loadedAt(version: RunVersion | null): Promise<LoadedVersion> {
    const first = this.#first;
    if (version === null || sameVersion(version, first.version)) return first.loaded;
    if (version.reads === "saved-files") return await loadVersion(this.#dir.store);
    if (this.#other?.commit !== version.commit) {
      const { commit } = version;
      // A load that failed, such as git short of processes, is tried again by the next read.
      const loaded = this.#loadCommit(commit).catch((error: unknown) => {
        if (this.#other?.commit === commit) this.#other = undefined;
        throw error;
      });
      this.#other = { commit, loaded };
    }
    return await this.#other.loaded;
  }

  async #loadCommit(commit: string): Promise<LoadedVersion> {
    const history = await this.#openHistory(this.#dir.root);
    if (history === null) {
      throw new Error(plainText(routinesMessages.noHistoryForVersion(commit).phrase));
    }
    try {
      return await loadVersion(new VersionSource(history.vcs, commit, this.#dir.store.location));
    } finally {
      await history.close();
    }
  }
}

function sameVersion(a: RunVersion, b: RunVersion): boolean {
  if (a.reads === "saved-files" || b.reads === "saved-files") return a.reads === b.reads;
  return a.commit === b.commit;
}
