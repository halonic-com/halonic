import { KindedError } from "@halonicjs/std";

/** What git said, as the shell's `git` command gives it back. */
export interface SharedCopyAnswer {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/** What {@link SharedCopy} needs from the workspace's history. */
export interface SharedCopyOptions {
  /** Runs `git <args>`; `"no-git"` when git isn't on this computer. */
  readonly run: (args: readonly string[]) => Promise<SharedCopyAnswer | "no-git">;
  /** The name git gives the place the workspace was shared to. */
  readonly remoteName: string;
  /** The most versions counted; a bigger count reads as this many. */
  readonly countCap: number;
  /** Why a failed `log` failed, as one plain sentence. */
  readonly reason: (answer: SharedCopyAnswer) => string;
}

/** What git last knew of the shared copy of the open workspace, and how many versions differ. */
export class SharedCopy {
  readonly #options: SharedCopyOptions;

  constructor(options: SharedCopyOptions) {
    this.#options = options;
  }

  /**
   * What git last knew of the shared copy's branch: the branch this one tracks, else the shared
   * copy's branch of the same name (a share not yet tracked), else `null`.
   */
  async ref(): Promise<string | null> {
    if (await this.#exists("@{upstream}")) return "@{upstream}";
    const branch = await this.#options.run(["rev-parse", "--abbrev-ref", "HEAD"]);
    if (branch === "no-git") throw noGit();
    const name = branch.stdout.trim();
    if (branch.code !== 0 || name === "" || name === "HEAD") return null;
    const sameName = `${this.#options.remoteName}/${name}`;
    return (await this.#exists(sameName)) ? sameName : null;
  }

  /** How many versions `range` holds, counting at most the cap. */
  async count(range: string): Promise<number> {
    const log = await this.#options.run([
      "log",
      "--oneline",
      `--max-count=${this.#options.countCap}`,
      range,
    ]);
    if (log === "no-git") throw noGit();
    if (log.code !== 0) throw new KindedError("unavailable", this.#options.reason(log));
    return log.stdout.split("\n").filter((line) => line.trim() !== "").length;
  }

  async #exists(ref: string): Promise<boolean> {
    const found = await this.#options.run(["rev-parse", "--verify", "--quiet", ref]);
    if (found === "no-git") throw noGit();
    return found.code === 0;
  }
}

function noGit(): KindedError {
  return new KindedError("unavailable", "git isn't on this computer.");
}
