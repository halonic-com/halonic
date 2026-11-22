import type { PluginIssuesClient } from "@paperclipai/plugin-sdk";

/**
 * The board check's write gate (Liam's conditions on HAL-16192). A pass
 * plans its writes first; this file is the only place that sends them. It
 * allows exactly three kinds: a comment on a task named in the settings,
 * an update of the two named documents on the Board Checker's task, and a
 * wake-up through Paperclip's wake call. Nothing changes a status, an
 * assignee, a blocker, a label or an approval: the API below can't.
 */

/** The two documents the board check keeps on the Board Checker's task. */
export const boardDocumentKeys = ["board-waiting", "board-asks"] as const;
export type BoardDocumentKey = (typeof boardDocumentKeys)[number];

/** Every comment ends with this line, so the Board Checker and the ask spotting know it's ours. */
export const signature = "Board check (plugin)";

/** One write a pass plans. Bodies carry ids, codes and times only, never comment or error text. */
export type BoardWrite =
  | { readonly kind: "comment"; readonly taskId: string; readonly body: string }
  | { readonly kind: "document"; readonly key: BoardDocumentKey; readonly body: string }
  | {
      readonly kind: "wake";
      readonly taskId: string;
      readonly reason: string;
      /** Paperclip drops a second wake-up with the same key. */
      readonly key: string;
    };

/** At most this many writes of each kind in one pass; above them the pass writes nothing. */
export const ceilings: Readonly<Record<BoardWrite["kind"], number>> = {
  wake: 5,
  comment: 5,
  document: 2,
};

/** The only part of the plugin context the gate gets: two write calls and a document upsert. */
export interface BoardWriteApi {
  readonly issues: Pick<PluginIssuesClient, "createComment" | "requestWakeup"> & {
    readonly documents: Pick<PluginIssuesClient["documents"], "upsert">;
  };
}

/** What the gate needs to know about one company's pass. */
export interface WriteGate {
  readonly companyId: string;
  readonly boardCheckerTaskId: string;
  /** The tasks a comment may go to, all named in the board's settings. */
  readonly commentTasks: ReadonlySet<string>;
  /** Reads the board's no-writes switch again; called right before each write. */
  readonly writesOn: () => Promise<boolean>;
  readonly log: (line: string) => void;
  /** Raises the HAL-16006 alert for a pass that wrote nothing because of the gate. */
  readonly alert: (why: GateRefusal) => Promise<void>;
}

/** Why the gate refused a whole pass. */
export type GateRefusal = "not_allowed" | "over_ceiling";

/** What the gate did with a pass's plan. */
export interface GateOutcome {
  readonly written: number;
  /** Writes it only logged because the switch was off. */
  readonly logged: number;
  readonly refused: GateRefusal | undefined;
}

const wakeReasonPattern = /^board_check_[a-z_]+$/;

/** Why a planned write isn't on the allowlist, or undefined when it is. */
export function refusal(
  write: BoardWrite,
  gate: Pick<WriteGate, "commentTasks">,
): string | undefined {
  switch (write.kind) {
    case "comment":
      return gate.commentTasks.has(write.taskId)
        ? undefined
        : "a comment on a task the settings don't name";
    case "document":
      return (boardDocumentKeys as readonly string[]).includes(write.key)
        ? undefined
        : "a document other than board-waiting and board-asks";
    case "wake":
      return write.taskId !== "" && wakeReasonPattern.test(write.reason)
        ? undefined
        : "a wake-up without a task or a board_check reason";
    default:
      return `a write of kind ${String((write as { kind?: unknown }).kind)}`;
  }
}

/** One line for the log: the kind, the target and the size, never the text. */
export function describe(write: BoardWrite): string {
  switch (write.kind) {
    case "comment":
      return `comment on task ${write.taskId} (${write.body.length} characters)`;
    case "document":
      return `update document ${write.key} (${write.body.length} characters)`;
    case "wake":
      return `wake task ${write.taskId} (${write.reason})`;
  }
}

function overCeiling(plan: readonly BoardWrite[]): boolean {
  return (Object.keys(ceilings) as BoardWrite["kind"][]).some(
    (kind) => plan.filter((write) => write.kind === kind).length > ceilings[kind],
  );
}

async function send(api: BoardWriteApi, gate: WriteGate, write: BoardWrite): Promise<void> {
  switch (write.kind) {
    case "comment":
      await api.issues.createComment(write.taskId, `${write.body}\n\n${signature}`, gate.companyId);
      return;
    case "document":
      await api.issues.documents.upsert({
        issueId: gate.boardCheckerTaskId,
        key: write.key,
        body: write.body,
        companyId: gate.companyId,
        title: write.key === "board-asks" ? "Board asks" : "Waiting on the board",
        changeSummary: signature,
      });
      return;
    case "wake":
      await api.issues.requestWakeup(write.taskId, gate.companyId, {
        reason: write.reason,
        idempotencyKey: write.key,
      });
      return;
  }
}

/**
 * Sends a pass's planned writes, or none of them. A write off the allowlist
 * or a plan above the ceilings refuses the whole pass and raises the alert.
 * Otherwise each write goes out only if the switch is still on right before
 * it; with the switch off it is logged instead.
 */
export async function commitWrites(
  api: BoardWriteApi,
  gate: WriteGate,
  plan: readonly BoardWrite[],
): Promise<GateOutcome> {
  const refused = plan.map((write) => refusal(write, gate)).find((why) => why !== undefined);
  if (refused !== undefined) {
    gate.log(`Board check: refused ${refused}; wrote nothing this pass.`);
    await gate.alert("not_allowed");
    return { written: 0, logged: 0, refused: "not_allowed" };
  }
  if (overCeiling(plan)) {
    const counts = Object.keys(ceilings)
      .map((kind) => `${plan.filter((write) => write.kind === kind).length} ${kind}`)
      .join(", ");
    gate.log(`Board check: planned ${counts}, above the ceilings; wrote nothing this pass.`);
    await gate.alert("over_ceiling");
    return { written: 0, logged: 0, refused: "over_ceiling" };
  }
  let written = 0;
  let logged = 0;
  for (const write of plan) {
    if (await gate.writesOn()) {
      await send(api, gate, write);
      written += 1;
    } else {
      gate.log(`Board check: would ${describe(write)} (writes off).`);
      logged += 1;
    }
  }
  return { written, logged, refused: undefined };
}
