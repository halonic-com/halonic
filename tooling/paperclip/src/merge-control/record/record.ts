import type { PluginStateClient } from "@paperclipai/plugin-sdk";
import { gateRow } from "../gate.ts";
import type { GatePull, MergeSnapshot } from "../snapshot.ts";
import type { Decision, MergeAction, MergeSettings } from "../state.ts";

/**
 * The recorder (merge controller ADR, HAL-17700): each pass's snapshot,
 * the pull requests that passed the gate and the actions with their cost,
 * kept 14 days in plugin state, so the simulator can replay a day. No
 * comment, review or log text is kept: only who wrote what kind of text
 * and when.
 */

/** One recorded pass. */
export interface PassRecord {
  readonly version: 1;
  readonly at: string;
  readonly snapshot: MergeSnapshot;
  /** Pull requests that passed the gate this pass, queued or not. */
  readonly ready: readonly number[];
  readonly actions: readonly MergeAction[];
}

/** Days kept. */
export const keptDays = 14;

function withoutText(pull: GatePull): GatePull {
  return {
    ...pull,
    texts: pull.texts.map((text) => ({ ...text, body: "" })),
    ciOkRun: pull.ciOkRun === null ? null : { ...pull.ciOkRun, ciOkLog: "" },
  };
}

function actionWithoutText(action: MergeAction): MergeAction {
  if (action.kind === "comment") {
    return { ...action, body: "" };
  }
  if (action.kind === "dequeue") {
    return { ...action, comment: "" };
  }
  return action;
}

/** The record of one pass, without comment, review or log text. */
export function passRecord(
  snapshot: MergeSnapshot,
  decision: Decision,
  settings: MergeSettings,
  now: Date,
): PassRecord {
  return {
    version: 1,
    at: now.toISOString(),
    snapshot: { ...snapshot, pulls: snapshot.pulls.map(withoutText) },
    ready: snapshot.pulls
      .filter((pull) => gateRow(snapshot, pull, settings).pass)
      .map((pull) => pull.number),
    actions: decision.actions.map(actionWithoutText),
  };
}

/** Where passes are kept: one entry per pass, an index per day, and the list of days. */
export interface RecordStore {
  save(record: PassRecord): Promise<void>;
  day(date: string): Promise<PassRecord[]>;
}

type StateClient = Pick<PluginStateClient, "get" | "set" | "delete">;

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((each) => typeof each === "string") : [];
}

/** The recorder's store in plugin state, for one company. */
export function pluginRecordStore(state: StateClient, companyId: string): RecordStore {
  const key = (stateKey: string) =>
    ({
      scopeKind: "company",
      scopeId: companyId,
      namespace: "merge-control-record",
      stateKey,
    }) as const;
  const forget = async (date: string) => {
    for (const at of strings(await state.get(key(`day:${date}`)))) {
      await state.delete(key(`pass:${at}`));
    }
    await state.delete(key(`day:${date}`));
  };
  return {
    async save(record) {
      const date = record.at.slice(0, 10);
      await state.set(key(`pass:${record.at}`), record);
      const passes = strings(await state.get(key(`day:${date}`)));
      await state.set(key(`day:${date}`), [...passes, record.at]);
      const oldest = new Date(Date.parse(date) - (keptDays - 1) * 86_400_000).toISOString();
      const days = strings(await state.get(key("days")));
      for (const old of days.filter((each) => each < oldest.slice(0, 10))) {
        await forget(old);
      }
      const kept = days.filter((each) => each >= oldest.slice(0, 10) && each !== date);
      await state.set(key("days"), [...kept, date]);
    },
    async day(date) {
      const records: PassRecord[] = [];
      for (const at of strings(await state.get(key(`day:${date}`)))) {
        const record = (await state.get(key(`pass:${at}`))) as PassRecord | null;
        if (record?.version === 1) {
          records.push(record);
        }
      }
      return records;
    },
  };
}
