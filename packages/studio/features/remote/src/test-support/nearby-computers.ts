import type {
  NearbyComputer,
  NearbyComputers,
  NearbyId,
  NearbyStart,
} from "../phone/nearby-computers.ts";

/** A computer the fake lists, by its name, with an id made from the name. */
export function nearby(name: string): NearbyComputer {
  return { id: `nearby-${name.replaceAll(/\W/g, "")}` as NearbyId, name };
}

/**
 * An in-memory {@link NearbyComputers} for the picker's tests. A test sets what the next browse
 * answers, and pushes lists with {@link FakeNearbyComputers.push}. It keeps the shell's rules the
 * picker relies on: an empty list first once browsing, and no list to a browse that was stopped,
 * replaced, or didn't start.
 */
export class FakeNearbyComputers implements NearbyComputers {
  /** What the next {@link browse} answers. */
  nextStart: NearbyStart = { kind: "browsing" };
  /** `browse` and `stop`, in the order they came. */
  readonly calls: ("browse" | "stop")[] = [];
  private listener: ((computers: readonly NearbyComputer[]) => void) | undefined;

  /** Whether a browse is in progress, with a picker to tell. */
  get browsing(): boolean {
    return this.listener !== undefined;
  }

  async browse(onChange: (computers: readonly NearbyComputer[]) => void): Promise<NearbyStart> {
    this.calls.push("browse");
    this.listener = undefined;
    const start = this.nextStart;
    if (start.kind !== "browsing") return start;
    this.listener = onChange;
    onChange([]);
    return start;
  }

  async stop(): Promise<void> {
    this.calls.push("stop");
    this.listener = undefined;
  }

  /** Sends the whole list, sorted by name as the shell does, to the browse in progress. */
  push(computers: readonly NearbyComputer[]): void {
    const sorted = [...computers].sort((a, b) => a.name.localeCompare(b.name));
    this.listener?.(sorted);
  }
}
