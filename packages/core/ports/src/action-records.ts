import type { ActionRecordEvent } from "@halonicjs/events";

/** Version of the {@link ActionRecords} port. A breaking change bumps it and comes with an ADR. */
export const actionRecordsVersion = 1;

/**
 * Each action request's record: what the user reviewed and ran, step by step
 * (requirement `ports.action-records`, ADR 2026-11-24, action sender). It
 * lives outside every workspace, in files only the user can read, because it
 * names private repositories and the user's accounts; it never goes into a
 * workspace or git.
 *
 * The port is append-only: there is no call to change or delete an event.
 * An adapter refuses, with a `RangeError` and without writing it, any event
 * that `checkActionEvent` of `@halonicjs/events` doesn't take, so no token,
 * header, secret value or whole answer body can be stored. The adapter
 * deletes the record of a finished request 90 days after its
 * `action.finished`, on its own.
 *
 * "A request runs at most once" is read from here by Studio's page, so it is
 * page logic, not a guarantee of the shell: `admin` and `irreversible` steps
 * still need the sender's native dialog.
 *
 * @example
 * await records.append({ type: "action.step.started", request: "req-1", at: "2026-11-24T13:00:00.000Z", step: 1 });
 * const record = await records.read("req-1");
 */
export interface ActionRecords {
  /** Adds one event to its request's record. Rejects with a `RangeError` an event the allow-list refuses. */
  append(event: ActionRecordEvent): Promise<void>;
  /** A request's events, oldest first; empty for a request with no record. */
  read(request: string): Promise<readonly ActionRecordEvent[]>;
}
