// Gates for the engine's tests. Most tests don't care about approvals, so
// their kits use `reviewedTools`; the tests of the gate itself use a
// `ApprovalDesk`, which keeps approvals the way a person's would be kept.

import { readToolListing } from "@halonicjs/app";
import { approveAllShown, approveListedTools } from "@halonicjs/app/listed-tools";
import type {
  ChatTurnWaiting,
  ConnectorClient,
  Digest,
  ToolApproval,
  ToolApprovalKey,
  ToolApprovalStore,
  ToolServer,
  WaitingVersion,
} from "@halonicjs/ports";
import { allToolsReviewed } from "../testing.ts";
import type { ListedToolApprovalStore } from "./listed-tool-approval.ts";

/** A gate that passes every connector's tools as they are: the tests' tools are scripted. */
export const reviewedTools = allToolsReviewed;

/** An approval store in memory, and the gate that reads it. */
export class ApprovalDesk {
  readonly store = new MemoryApprovals();
  /** What the host heard, as `reportWaiting` gives it. */
  readonly heard: { connector: string; waiting: readonly ChatTurnWaiting[] }[] = [];
  readonly gate: ListedToolApprovalStore = {
    kind: "store",
    location: "/workspaces/acme",
    store: this.store,
    digest: sha256(),
    clock: { now: () => new Date("2026-11-13T09:00:00.000Z") },
    addressOf: async (connector) => ({ kind: "listed", server: serverOf(connector) }),
    reportWaiting: (connector, waiting) => this.heard.push({ connector, waiting }),
  };

  /** Approves every tool `connector` lists now, as a person does with "Approve all". */
  async approveAll(connector: ConnectorClient): Promise<void> {
    const listing = readToolListing({
      source: connector.id,
      listed: await connector.listTools(),
      declared: [],
      otherNames: new Set(),
      trust: null,
    });
    const check = await approveListedTools({
      location: this.gate.location,
      source: connector.id,
      server: serverOf(connector.id),
      listing,
      store: this.store,
      digest: this.gate.digest,
      clock: this.gate.clock,
    });
    await approveAllShown(check, check.waiting, this.store, this.gate.clock);
  }
}

function serverOf(connector: string): ToolServer {
  return { kind: "http", url: `https://${connector}.example.com/mcp`, headers: null };
}

class MemoryApprovals implements ToolApprovalStore {
  private readonly approvals = new Map<string, ToolApproval>();

  async get(key: ToolApprovalKey): Promise<ToolApproval | null> {
    return this.approvals.get(keyOf(key)) ?? null;
  }
  async approve(approval: ToolApproval): Promise<void> {
    this.approvals.set(keyOf(approval), approval);
  }
  async revoke(key: ToolApprovalKey): Promise<void> {
    this.approvals.delete(keyOf(key));
  }
  async list(location: string, source: string): Promise<ToolApproval[]> {
    return [...this.approvals.values()].filter(
      (approval) => approval.location === location && approval.source === source,
    );
  }
  async noteWaiting(_key: ToolApprovalKey, version: WaitingVersion): Promise<WaitingVersion[]> {
    return [version];
  }
}

function keyOf(key: ToolApprovalKey): string {
  return JSON.stringify([key.location, key.source, key.name]);
}

/**
 * A stand-in for SHA-256 that gives each text its own 32 bytes, which is
 * all these tests need: this package can't use Node or browser APIs, and
 * the real digest has its own tests in `core/app`.
 */
function sha256(): Digest {
  return {
    async sha256(data) {
      const out = new Uint8Array(32);
      data.forEach((byte, index) => {
        const slot = index % 32;
        out[slot] = ((out[slot] ?? 0) * 31 + byte + index) & 0xff;
      });
      return out;
    },
  };
}
