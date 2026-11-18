import type { ChangesSource, UpdateChoice } from "./api.ts";
import type { ChangesListState, MergeOutcome } from "./changes-list-state.ts";
import { mergeWords } from "./changes-words.ts";
import { loadFailureReason } from "./load-failure.ts";

/** What the merge steps need from the {@link ChangesList} that owns them. */
export interface MergeHost {
  readonly source: ChangesSource;
  state(): ChangesListState;
  disposed(): boolean;
  set(state: ChangesListState): void;
  refresh(): Promise<void>;
}

/**
 * The name a kept copy carries, as in `notes (Sam's).md`: the possessive of the person's name
 * with anything a path can't hold replaced, so a name never makes a subfolder or a file Windows
 * refuses.
 */
export function copyLabel(people: readonly string[]): string {
  const [first] = people;
  if (people.length !== 1 || first === undefined) return "shared";
  const safe = first
    // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what is removed.
    .replace(/[\u0000-\u001f\\/:*?"<>|]/gu, "-")
    .replace(/[. ]+$/u, "")
    .trim();
  return safe === "" ? "shared" : `${safe}'s`;
}

/**
 * The steps of a merge of both sides' versions: choose per item, take a choice back, finish or
 * cancel. One runs at a time, then the list reads again.
 */
export class MergeSteps {
  readonly #host: MergeHost;

  constructor(host: MergeHost) {
    this.#host = host;
  }

  /** Opens the choices of a merge that was left open. */
  continue(): void {
    const state = this.#host.state();
    if (state.merge !== undefined) this.#host.set({ ...state, choosing: true });
  }

  /** Settles one item: Keep mine, Use theirs or Keep both. */
  choose(path: string, choice: UpdateChoice): Promise<MergeOutcome> {
    const label = copyLabel(this.#host.state().merge?.people ?? []);
    return this.#step(() => this.#host.source.chooseUpdate(path, choice, label));
  }

  /** Takes a choice back. */
  undo(path: string): Promise<MergeOutcome> {
    return this.#step(() => this.#host.source.undoUpdateChoice(path));
  }

  /** Completes the merge once every item is chosen, as "Merged Sam's updates". */
  finish(): Promise<MergeOutcome> {
    const people = this.#host.state().merge?.people ?? [];
    return this.#step(() => this.#host.source.finishMerge(mergeWords.merged(people)), true);
  }

  /** Drops the merge and puts every file back as it was. */
  cancel(): Promise<MergeOutcome> {
    return this.#step(() => this.#host.source.cancelMerge(), true);
  }

  /** Runs one step, then reads again; the reason it failed, or `undefined`. */
  async #step(step: () => Promise<void>, ends = false): Promise<MergeOutcome> {
    const host = this.#host;
    if (host.disposed() || host.state().mergeBusy) return mergeWords.working;
    host.set({ ...host.state(), mergeBusy: true });
    let reason: string | undefined;
    try {
      await step();
    } catch (error) {
      reason = loadFailureReason(error);
    }
    if (host.disposed()) return reason;
    host.set({ ...host.state(), mergeBusy: false, choosing: !ends || reason !== undefined });
    await host.refresh();
    return reason;
  }
}
