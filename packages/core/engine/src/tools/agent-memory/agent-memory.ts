// An agent's memory: notes it keeps between runs and chats. They are runtime
// data in the `RecordStore`, never workspace files, so memory works the same
// on every target, including those without a writable folder.

import { type Clock, foldRecords, type RecordChange, type RecordStore } from "@halonicjs/ports";

/** The collection an agent's notes are kept in. A collection defined in a file can't contain `/`, so none collides with it. */
export function agentMemoryCollection(agentId: string): string {
  if (agentId === "") {
    throw new RangeError("An agent's memory needs the agent's id.");
  }
  return `agent-memory/${agentId}`;
}

/** One note in an agent's memory. */
export interface MemoryNote {
  readonly title: string;
  readonly text: string;
  /** When the note was last saved. */
  readonly at: string;
}

/** The longest note title, in characters. */
export const maxNoteTitle = 120;
/** The longest note text, in characters, so one note can't fill the store. */
export const maxNoteText = 16_000;

export interface AgentMemoryOptions {
  readonly records: RecordStore;
  /** The time each change is stamped with. */
  readonly clock: Clock;
  readonly agentId: string;
  /** The run the agent works in, which each change names; absent in a chat. */
  readonly runId?: string;
}

/**
 * One agent's notes in the collection {@link agentMemoryCollection} names.
 * A note is found by its title, ignoring case and the spaces around it, so
 * saving a title again replaces that note.
 */
export class AgentMemory {
  private readonly options: AgentMemoryOptions;
  private readonly collection: string;

  constructor(options: AgentMemoryOptions) {
    this.options = options;
    this.collection = agentMemoryCollection(options.agentId);
  }

  /** Every note, by title. A record that isn't a note is left out. */
  async notes(): Promise<MemoryNote[]> {
    const notes: MemoryNote[] = [];
    for (const record of foldRecords(await this.changes()).values()) {
      const { title, text } = record.values;
      if (typeof title === "string" && typeof text === "string") {
        notes.push({ title, text, at: record.at });
      }
    }
    return notes.sort((a, b) => a.title.localeCompare(b.title));
  }

  /**
   * Saves a note under its title, replacing a note with the same title.
   *
   * @throws RangeError when the title is empty or too long, or the text too long; nothing is written then
   */
  async save(title: string, text: string): Promise<MemoryNote> {
    const trimmed = title.trim();
    if (trimmed === "" || trimmed.length > maxNoteTitle) {
      throw new RangeError(`A note's title must be 1 to ${maxNoteTitle} characters.`);
    }
    if (text.length > maxNoteText) {
      throw new RangeError(`A note's text must be at most ${maxNoteText} characters.`);
    }
    const id = noteId(trimmed);
    const exists = foldRecords(await this.changes()).has(id);
    const at = this.options.clock.now().toISOString();
    await this.options.records.append([
      this.change(id, exists ? "update" : "add", at, { title: trimmed, text }),
    ]);
    return { title: trimmed, text, at };
  }

  /** Removes the note with a title, and says whether there was one. */
  async forget(title: string): Promise<boolean> {
    const id = noteId(title.trim());
    if (!foldRecords(await this.changes()).has(id)) {
      return false;
    }
    const at = this.options.clock.now().toISOString();
    await this.options.records.append([this.change(id, "remove", at, null)]);
    return true;
  }

  private changes(): Promise<RecordChange[]> {
    return this.options.records.changes(this.collection);
  }

  private change(
    id: string,
    op: RecordChange["op"],
    at: string,
    values: RecordChange["values"],
  ): RecordChange {
    const { agentId, runId } = this.options;
    return {
      at,
      collection: this.collection,
      id,
      op,
      values,
      by: { agent: agentId, ...(runId === undefined ? {} : { runId }) },
    };
  }
}

function noteId(title: string): string {
  return title.toLowerCase();
}
