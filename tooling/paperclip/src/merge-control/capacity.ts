import type { PassContext } from "./context.ts";
import type { QueueEntry } from "./snapshot.ts";
import type { ActionCost } from "./state.ts";

/**
 * Runner capacity and the cost of a decision (merge controller ADR,
 * HAL-17700, board 24 Nov 17:47). Every jump rebuilds the groups behind it,
 * so the core jumps only while merge-queue runners are free, and each jump
 * or dequeue says how many groups it cancels and their runner-minutes.
 */

/** Why runner capacity is too short to jump, or undefined when a jump may go. */
export function capacityShort(context: PassContext): string | undefined {
  const { capacity } = context.snapshot;
  const label = context.settings.queueRunnerLabel;
  // Capacity the reader couldn't read counts as short (ADR "facts").
  if (capacity === null || capacity.freeQueueSlots === null || capacity.waitingByLabel === null) {
    return "capacity unknown";
  }
  if (capacity.freeQueueSlots < 1) {
    return `no free ${label} slot`;
  }
  const waiting = capacity.waitingByLabel[label] ?? 0;
  if (waiting > 0) {
    return `${waiting} ${label} job(s) waiting for a runner`;
  }
  return undefined;
}

function costOf(context: PassContext, groups: readonly QueueEntry[]): ActionCost {
  const groupsCancelled = groups.filter((each) => each.groupHead !== null).length;
  return {
    groupsCancelled,
    runnerMinutes: groupsCancelled * context.settings.groupRunnerMinutes,
  };
}

/** Nothing cancelled: an enqueue at the back. */
export const noCost: ActionCost = { groupsCancelled: 0, runnerMinutes: 0 };

/** A jump goes ahead of every entry, so every group already formed is rebuilt. */
export function jumpCost(context: PassContext, queued: readonly number[]): ActionCost {
  return costOf(
    context,
    context.snapshot.queue.filter((each) => queued.includes(each.number)),
  );
}

/** A dequeue cancels its own group and every group formed behind it. */
export function dequeueCost(context: PassContext, position: number): ActionCost {
  return costOf(
    context,
    context.snapshot.queue.filter((each) => each.position >= position),
  );
}
