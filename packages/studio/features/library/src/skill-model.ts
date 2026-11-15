import {
  editSkillText,
  type ItemUsage,
  readSkillText,
  type SkillChange,
  type SkillParts,
  type SkillTextError,
} from "@halonicjs/app";
import type { SkillFile, SkillHost, SkillRef } from "./skill-host.ts";

/** The parts that have a hint for a refused empty value. */
export type SkillField = "name" | "description";

/** What the skill page shows. */
export interface SkillState {
  readonly loaded: boolean;
  /** The workspace has no such skill (any more). */
  readonly gone: boolean;
  /** The file has no valid header, so only a person can fix it in the file. */
  readonly unreadable: boolean;
  readonly parts?: SkillParts;
  readonly files: readonly SkillFile[];
  readonly usage?: ItemUsage;
  /** The fields whose last edit was emptied and refused; each hint stays until that field's next edit. */
  readonly kept: readonly SkillField[];
}

/** The field a refused edit emptied; `undefined` for a file that can't be edited at all. */
function refusedField(error: SkillTextError): SkillField | undefined {
  if (error === "name_missing") return "name";
  if (error === "description_missing") return "description";
  return undefined;
}

/**
 * One skill's page state: its parts read from the host's text, a save when a field is left, and
 * a refresh whenever the host says a skill may have changed. The page reads it with
 * `useSyncExternalStore`.
 */
export class SkillModel {
  state: SkillState = { loaded: false, gone: false, unreadable: false, files: [], kept: [] };
  private text = "";
  private readonly listeners = new Set<() => void>();
  private stopHost: (() => void) | undefined;
  private latest = 0;

  private readonly host: SkillHost;
  private readonly skill: SkillRef;

  constructor(host: SkillHost, skill: SkillRef) {
    this.host = host;
    this.skill = skill;
  }

  /** Calls `listener` after each change of `state`; returns the way to stop. The first listener starts watching the host. */
  subscribe(listener: () => void): () => void {
    if (this.listeners.size === 0) {
      this.stopHost = this.host.subscribe(() => void this.refresh());
      void this.refresh();
    }
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.stopHost?.();
        this.stopHost = undefined;
      }
    };
  }

  /** Asks the host again. A failed read keeps what was shown. An older answer never replaces a newer one. */
  async refresh(): Promise<void> {
    const ticket = ++this.latest;
    try {
      const [source, usage] = await Promise.all([
        this.host.read(this.skill),
        this.host.usage(this.skill),
      ]);
      if (ticket !== this.latest) return;
      if (source === undefined) {
        this.set({ ...this.state, loaded: true, gone: true });
        return;
      }
      this.text = source.text;
      const read = readSkillText(source.text);
      this.set({
        loaded: true,
        gone: false,
        unreadable: !read.ok,
        files: source.files,
        usage,
        kept: this.state.kept,
        ...(read.ok ? { parts: read.value } : {}),
      });
    } catch {
      // The page keeps what it shows; the host says why a read failed.
    }
  }

  /**
   * Saves what was typed in a field the person left. An emptied name or description writes
   * nothing and keeps the old value with its hint; text that changes nothing writes nothing.
   * Resolves to whether the field's draft can go: `false` when the write failed, so the draft
   * stays to be saved again.
   */
  async leave(change: SkillChange): Promise<boolean> {
    const edited = editSkillText(this.text, change);
    if (!edited.ok) {
      const refused = refusedField(edited.error);
      if (refused !== undefined && !this.state.kept.includes(refused)) {
        this.set({ ...this.state, kept: [...this.state.kept, refused] });
      }
      return refused !== undefined;
    }
    if (edited.value === this.text) return true;
    try {
      await this.host.write(this.skill, edited.value);
    } catch {
      return false;
    }
    // What was written is the text now, even if the refresh below fails or is late: the next
    // leave edits on top of it. An older read still in flight no longer counts.
    this.latest++;
    this.text = edited.value;
    const read = readSkillText(edited.value);
    this.set({
      ...this.state,
      unreadable: !read.ok,
      ...(read.ok ? { parts: read.value } : {}),
    });
    await this.refresh();
    return true;
  }

  /** A field is being edited again: its hint goes. */
  edited(field: SkillField): void {
    if (!this.state.kept.includes(field)) return;
    this.set({ ...this.state, kept: this.state.kept.filter((each) => each !== field) });
  }

  private set(state: SkillState): void {
    this.state = state;
    for (const listener of [...this.listeners]) listener();
  }
}
