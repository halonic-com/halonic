import type { ChannelResult, MessagingRefusal } from "@halonicjs/ports";

/** A channel call's refusal. */
export function refused(reason: MessagingRefusal): Promise<ChannelResult> {
  return Promise.resolve({ outcome: "refused", reason });
}

/** A deep copy of plain data, so a test can't change the fake's items through what a read gave. */
export function copy<Value>(value: Value): Value {
  return JSON.parse(JSON.stringify(value)) as Value;
}
