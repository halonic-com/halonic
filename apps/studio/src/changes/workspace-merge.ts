import type { DefinitionStore } from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import type {
  ChangesSource,
  MergeStart,
  ReplaceResult,
  UpdateChoice,
  UpdateItem,
  UpdateMerge,
} from "@halonicjs/studio-feature-source-control/api";

/** What git said, as the shell's `git` command gives it back. */
interface Answer {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/** What {@link UpdatesMerge} reads and writes. */
export interface UpdatesMergeOptions {
  /** Runs `git <args>`; throws `KindedError` when git isn't on this computer. */
  readonly run: (args: readonly string[]) => Promise<Answer>;
  /** Why a git call failed, as one plain sentence: git's own output is never shown. */
  readonly reason: (answer: Answer, doing: "get" | "finish") => string;
  /** The folder's files. */
  readonly files: Pick<DefinitionStore, "read" | "write" | "remove">;
  /** Where the choices are kept, so they outlive the window. */
  readonly choices: ChoicesMemory;
  /** Writes a file only while it still holds `expected`. */
  readonly replaceFile: ChangesSource["replaceFile"];
  /** Deletes a file only while it still holds `expected`. */
  readonly removeFile: ChangesSource["removeFile"];
  /** The paths with changes that aren't in a version yet. */
  readonly changedPaths: () => Promise<ReadonlySet<string>>;
  /** Whether a path is one of Halonic's own and so not part of the workspace's versions. */
  readonly isPrivate: (path: string) => boolean;
}

/** One text kept for this workspace: what the person chose so far in a half-done Get updates. */
export interface ChoicesMemory {
  readonly read: () => string | null;
  readonly write: (text: string) => void;
  readonly remove: () => void;
}

/**
 * {@link ChoicesMemory} in `storage` (the window's), under a key for the workspace at `location`.
 * Without storage, or when it refuses, the text is kept for this window only.
 */
export function choicesMemory(storage: Storage | undefined, location: string): ChoicesMemory {
  const key = `halonic.updates-choices:${location}`;
  let session: string | null = null;
  return {
    read: () => {
      try {
        return storage?.getItem(key) ?? session;
      } catch {
        return session;
      }
    },
    write: (text) => {
      session = text;
      try {
        storage?.setItem(key, text);
      } catch {
        // Kept for this window only.
      }
    },
    remove: () => {
      session = null;
      try {
        storage?.removeItem(key);
      } catch {
        // Nothing more to remove.
      }
    },
  };
}

/** What is kept of the choices: the commit they are for, and one entry for each chosen item. */
interface SavedChoices {
  readonly theirs: string;
  readonly chosen: Readonly<
    Record<string, { readonly choice: UpdateChoice; readonly copy?: string }>
  >;
}

/**
 * Combining the shared copy's versions with this workspace's when both have new ones (requirement
 * `source-control.get-updates-per-item`). git only records that the two histories join
 * (`merge -s ours`, which never touches a file or writes a conflict marker); every file is then
 * written by this class: what only the shared copy changed comes in at once, and an item both
 * changed waits for the person's choice. The merge stays open in git until it is finished or
 * cancelled, so quitting leaves it where it was.
 */
export class UpdatesMerge {
  readonly #o: UpdatesMergeOptions;

  constructor(options: UpdatesMergeOptions) {
    this.#o = options;
  }

  async start(): Promise<MergeStart> {
    const open = await this.read();
    if (open !== null) return { kind: "started", merge: open };
    const upstream = await this.#ok(
      ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
      "get",
    );
    const remote = upstream.trim().split("/")[0] ?? "";
    await this.#ok(["fetch", "--quiet", "--no-tags", remote], "get");
    const theirs = (
      await this.#ok(["rev-parse", "--verify", "--quiet", "@{upstream}"], "get")
    ).trim();
    if ((await this.#isAncestor(theirs, "HEAD")) || (await this.#isAncestor("HEAD", theirs))) {
      return { kind: "not-needed" };
    }
    const base = (await this.#ok(["merge-base", "HEAD", theirs], "get")).trim();
    const [mine, sams] = [await this.#changed(base, "HEAD"), await this.#changed(base, theirs)];
    const dirty = await this.#o.changedPaths();
    if ([...sams].some((path) => dirty.has(path))) {
      throw new KindedError(
        "unavailable",
        "updates would overwrite changes you haven't put in a version. Create a version first.",
      );
    }
    await this.#ok(["merge", "--no-ff", "--no-commit", "-s", "ours", theirs], "get");
    try {
      for (const path of [...sams].filter((path) => !mine.has(path)).sort()) {
        await this.#take(base, theirs, path);
      }
    } catch (error) {
      await this.#o.run(["merge", "--abort"]);
      throw error;
    }
    const merge = await this.read();
    if (merge === null) throw new KindedError("unavailable", "Git didn't get the updates.");
    return { kind: "started", merge };
  }

  async read(): Promise<UpdateMerge | null> {
    const head = await this.#o.run(["rev-parse", "--verify", "--quiet", "MERGE_HEAD"]);
    return head.code === 0 ? this.#build(head.stdout.trim()) : null;
  }

  /** The merge that brings in `theirs`. */
  async #build(theirs: string): Promise<UpdateMerge> {
    const base = (await this.#ok(["merge-base", "HEAD", theirs], "get")).trim();
    const [mine, sams] = [await this.#changed(base, "HEAD"), await this.#changed(base, theirs)];
    const saved = await this.#saved(theirs);
    const items: UpdateItem[] = [];
    for (const path of [...mine].filter((path) => sams.has(path)).sort()) {
      const [here, there] = [await this.#show("HEAD", path), await this.#show(theirs, path)];
      if (here === there) continue;
      const entry = saved.chosen[path];
      items.push({
        path,
        mine: here,
        theirs: there,
        choice: entry?.choice,
        copy: entry?.copy,
      });
    }
    const log = await this.#ok(["log", "--format=%an", `HEAD..${theirs}`], "get");
    const names = log.split("\n").filter((name) => name.trim() !== "");
    return { items, versions: names.length, people: [...new Set(names.reverse())] };
  }

  async choose(path: string, choice: UpdateChoice, label: string): Promise<void> {
    const merge = await this.#open();
    const item = merge.merge.items.find((candidate) => candidate.path === path);
    if (item === undefined)
      throw new KindedError("unavailable", "This item isn't part of the updates.");
    if (item.choice !== undefined)
      throw new KindedError("unavailable", "This item is already chosen.");
    let copy: string | undefined;
    if (choice === "theirs") {
      await this.#write(path, item.theirs, item.mine);
      await this.#stage(path);
    } else if (choice === "both") {
      if (item.theirs === null || item.mine === null) {
        throw new KindedError(
          "unavailable",
          "Only an item both sides still have can be kept twice.",
        );
      }
      copy = await this.#saveCopy(path, label, item.theirs);
      await this.#stage(copy);
    }
    await this.#save(merge.theirs, (chosen) => ({
      ...chosen,
      [path]: { choice, ...(copy === undefined ? {} : { copy }) },
    }));
  }

  async undo(path: string): Promise<void> {
    const merge = await this.#open();
    const item = merge.merge.items.find((candidate) => candidate.path === path);
    if (item?.choice === undefined) throw new KindedError("unavailable", "This item isn't chosen.");
    if (item.choice === "theirs") {
      await this.#write(path, item.mine, item.theirs);
      await this.#unstage(path);
    } else if (item.choice === "both" && item.copy !== undefined && item.theirs !== null) {
      await this.#unstage(item.copy);
      if ((await this.#o.removeFile(item.copy, item.theirs)) !== "replaced")
        throw changedMeanwhile();
    }
    await this.#save(merge.theirs, (chosen) => {
      const { [path]: _removed, ...rest } = chosen;
      return rest;
    });
  }

  async finish(message: string): Promise<void> {
    const { merge } = await this.#open();
    if (merge.items.some((item) => item.choice === undefined)) {
      throw new KindedError("unavailable", "Choose for every item first.");
    }
    await this.#ok(["commit", "-m", message], "finish");
    this.#o.choices.remove();
  }

  async cancel(): Promise<void> {
    if ((await this.read()) === null) return;
    await this.#ok(["merge", "--abort"], "get");
    this.#o.choices.remove();
  }

  /** The started merge and the commit it brings in; throws when none is started. */
  async #open(): Promise<{ readonly merge: UpdateMerge; readonly theirs: string }> {
    const head = await this.#o.run(["rev-parse", "--verify", "--quiet", "MERGE_HEAD"]);
    if (head.code !== 0) throw new KindedError("unavailable", "Getting updates isn't started.");
    const theirs = head.stdout.trim();
    return { merge: await this.#build(theirs), theirs };
  }

  /** Brings in one file only the shared copy changed, and adds it to the merge. */
  async #take(base: string, theirs: string, path: string): Promise<void> {
    if (this.#o.isPrivate(path)) return;
    const [was, there] = [await this.#show(base, path), await this.#show(theirs, path)];
    await this.#write(path, there, was);
    await this.#stage(path);
  }

  /** Writes `text`, or deletes the file for `null`, while the file still holds `expected`. */
  async #write(path: string, text: string | null, expected: string | null): Promise<void> {
    let result: ReplaceResult = "replaced";
    if (text !== null) result = await this.#o.replaceFile(path, text, expected);
    else if (expected !== null) result = await this.#o.removeFile(path, expected);
    if (result !== "replaced") throw changedMeanwhile();
  }

  /** Saves `text` beside `path` as `name (label).ext`, or `name (label 2).ext` when that is taken. */
  async #saveCopy(path: string, label: string, text: string): Promise<string> {
    const dot = path.lastIndexOf(".");
    const slash = path.lastIndexOf("/");
    const [stem, extension] = dot > slash + 1 ? [path.slice(0, dot), path.slice(dot)] : [path, ""];
    for (let n = 1; n < 100; n += 1) {
      const copy = `${stem} (${n === 1 ? label : `${label} ${n}`})${extension}`;
      const written = await this.#o.files.write(copy, text, { expected: "absent" });
      if (written.status === "written") return copy;
    }
    throw new KindedError("unavailable", "Halonic couldn't find a free name for the copy.");
  }

  async #stage(path: string): Promise<void> {
    await this.#ok(["add", "--", path], "get");
  }

  async #unstage(path: string): Promise<void> {
    await this.#ok(["reset", "-q", "--", path], "get");
  }

  /** Whether `ancestor` is part of `of`'s history. */
  async #isAncestor(ancestor: string, of: string): Promise<boolean> {
    return (await this.#o.run(["merge-base", "--is-ancestor", ancestor, of])).code === 0;
  }

  /** Each path that differs between `base` and `commit`; a renamed file counts as two. */
  async #changed(base: string, commit: string): Promise<Set<string>> {
    const out = await this.#ok(["diff", "--name-status", "-z", base, commit], "get");
    const parts = out.split("\0");
    const paths = new Set<string>();
    for (let i = 0; i < parts.length; ) {
      const status = parts[i] ?? "";
      if (status === "") break;
      const count = status.startsWith("R") || status.startsWith("C") ? 2 : 1;
      for (const path of parts.slice(i + 1, i + 1 + count)) {
        if (path !== undefined && path !== "" && !this.#o.isPrivate(path)) paths.add(path);
      }
      i += 1 + count;
    }
    return paths;
  }

  /** A file as `revision` has it, `null` where it isn't there. */
  async #show(revision: string, path: string): Promise<string | null> {
    const shown = await this.#o.run(["show", `${revision}:${path}`]);
    return shown.code === 0 ? shown.stdout : null;
  }

  async #saved(theirs: string): Promise<SavedChoices> {
    const text = this.#o.choices.read();
    if (text === null) return { theirs, chosen: {} };
    try {
      const parsed = JSON.parse(text) as SavedChoices;
      return parsed.theirs === theirs ? parsed : { theirs, chosen: {} };
    } catch {
      return { theirs, chosen: {} };
    }
  }

  async #save(
    theirs: string,
    change: (chosen: SavedChoices["chosen"]) => SavedChoices["chosen"],
  ): Promise<void> {
    const saved = await this.#saved(theirs);
    this.#o.choices.write(JSON.stringify({ theirs, chosen: change(saved.chosen) }));
  }

  /** Runs git, gives its output, and throws a plain reason when it fails. */
  async #ok(args: readonly string[], doing: "get" | "finish"): Promise<string> {
    const answer = await this.#o.run(args);
    if (answer.code !== 0) throw new KindedError("unavailable", this.#o.reason(answer, doing));
    return answer.stdout;
  }
}

function changedMeanwhile(): KindedError {
  return new KindedError(
    "unavailable",
    "The file changed while you were looking. Look at it again.",
  );
}
