import {
  maxWaitingVersions,
  type ToolApproval,
  type ToolApprovalKey,
  type ToolApprovalStore,
  UnreadableToolApprovalError,
  type WaitingVersion,
} from "@halonicjs/ports";

/**
 * A small in-memory `ToolApprovalStore` for the kernel's own tests, with a
 * way to make it unreadable. A deliberate fake: core may not use adapters,
 * not even in tests. Keys stay structured, in nested `Map`s, so no tool
 * name can collide with another or with an object's own properties.
 */
export class TestToolApprovalStore implements ToolApprovalStore {
  private readonly approvals = new Map<string, Map<string, Map<string, ToolApproval>>>();
  private readonly waiting = new Map<string, Map<string, Map<string, WaitingVersion[]>>>();
  /** Damaged approvals by name, and whether `list` says which tool each is for. */
  private readonly broken = new Map<string, { listNamesIt: boolean }>();
  private listError: unknown = null;

  async get(key: ToolApprovalKey): Promise<ToolApproval | null> {
    this.failIfBroken(key);
    return copy(this.approvalsOf(key.location, key.source).get(key.name) ?? null);
  }

  async approve(approval: ToolApproval): Promise<void> {
    this.approvalsOf(approval.location, approval.source).set(approval.name, copy(approval));
    this.waitingOf(approval).delete(approval.name);
  }

  async revoke(key: ToolApprovalKey): Promise<void> {
    this.approvalsOf(key.location, key.source).delete(key.name);
    this.waitingOf(key).delete(key.name);
  }

  async list(location: string, source: string): Promise<ToolApproval[]> {
    if (this.listError !== null) throw this.listError;
    const approvals = this.approvalsOf(location, source);
    const names = [...approvals.keys()].sort((a, b) => (a < b ? -1 : 1));
    for (const name of names) {
      const damage = this.broken.get(name);
      if (damage !== undefined) {
        throw new UnreadableToolApprovalError(
          { location, source },
          damage.listNamesIt ? name : null,
          "an approval can't be read",
        );
      }
    }
    return names.map((name) => copy(approvals.get(name) as ToolApproval));
  }

  async noteWaiting(key: ToolApprovalKey, version: WaitingVersion): Promise<WaitingVersion[]> {
    const noted = this.waitingOf(key).get(key.name) ?? [];
    const kept = noted.some((entry) => entry.fingerprint === version.fingerprint)
      ? noted
      : [...noted, { ...version }].slice(-maxWaitingVersions);
    this.waitingOf(key).set(key.name, kept);
    return copy(kept);
  }

  /**
   * Makes the approval for `name` unreadable from now on, as a damaged file
   * would be: `get` throws naming it, and `list` throws naming it only when
   * `listNamesIt`, as a file too damaged to name its tool can't.
   */
  breakApproval(name: string, listNamesIt = true): void {
    this.broken.set(name, { listNamesIt });
  }

  /** Makes `list` throw `error` from now on, as a store that fails for another reason would. */
  failList(error: unknown): void {
    this.listError = error;
  }

  private approvalsOf(location: string, source: string): Map<string, ToolApproval> {
    return nested(nested(this.approvals, location), source);
  }

  private waitingOf(key: Omit<ToolApprovalKey, "name">): Map<string, WaitingVersion[]> {
    return nested(nested(this.waiting, key.location), key.source);
  }

  private failIfBroken(key: ToolApprovalKey): void {
    if (this.broken.has(key.name)) {
      throw new UnreadableToolApprovalError(key, key.name, "an approval can't be read");
    }
  }
}

function nested<V>(map: Map<string, Map<string, V>>, key: string): Map<string, V> {
  let inner = map.get(key);
  if (inner === undefined) {
    inner = new Map();
    map.set(key, inner);
  }
  return inner;
}

/** A fresh copy through JSON, the way a record file round-trips. */
function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
