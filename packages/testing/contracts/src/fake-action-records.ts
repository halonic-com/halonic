import { type ActionRecordEvent, checkActionEvent } from "@halonicjs/events";
import type { ActionRecords } from "@halonicjs/ports";

/**
 * An {@link ActionRecords} that keeps each request's record in the process,
 * so the stepper can be built and tested before the shell's record files
 * exist (requirement `contracts.action-records`). Like every adapter, it
 * refuses an event the action events' allow-list refuses, and keeps a copy
 * of each event, so a caller changing its object later changes nothing.
 *
 * @example
 * const records = new FakeActionRecords();
 * await records.append({ type: "action.step.started", request: "req-1", at: "2026-11-24T13:00:00.000Z", step: 1 });
 */
export class FakeActionRecords implements ActionRecords {
  private readonly records = new Map<string, ActionRecordEvent[]>();

  append(event: ActionRecordEvent): Promise<void> {
    const check = checkActionEvent(event);
    if (!check.ok) {
      return Promise.reject(new RangeError(`Action event refused: ${check.problems.join("; ")}`));
    }
    if (check.event.type === "action.requested") {
      return Promise.reject(new RangeError("Action event refused: a request is a run event"));
    }
    const record = this.records.get(check.event.request) ?? [];
    record.push(copyOf(check.event));
    this.records.set(check.event.request, record);
    return Promise.resolve();
  }

  read(request: string): Promise<readonly ActionRecordEvent[]> {
    return Promise.resolve(copyOf(this.records.get(request) ?? []));
  }
}

/** A deep copy. Action events are plain JSON by their allow-list, so a JSON round trip copies them whole. */
function copyOf<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
