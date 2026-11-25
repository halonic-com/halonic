import type {
  CloudCommand,
  CloudCommandHandler,
  CloudLinkState,
  CloudLinkStore,
} from "./cloud-inbox-api.ts";

/** The kind of the command that sets the product's state. */
export const productStateKind = "product.state";

/** A try that took the command over runs it again, so a short lease is enough: one write. */
const productStateLeaseMs = 60_000;

const linkStates: readonly CloudLinkState[] = ["draft", "live", "paused"];

/** An ISO time as Cloud writes it, such as `2026-11-25T10:00:00.000Z`. */
const isoTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Carries out `product.state`: keeps the state, its sequence and its time in the link store. A
 * sequence the store already has, or an older one, changes nothing and still counts as done, so
 * running it twice is safe.
 */
export function productStateHandler(link: CloudLinkStore): CloudCommandHandler {
  return {
    kind: productStateKind,
    leaseMs: productStateLeaseMs,
    prepare(command) {
      const parsed = parseProductState(command);
      if (parsed === null) return null;
      return async () => {
        await link.write(parsed);
        return "done";
      };
    },
  };
}

/** The link a `product.state` command sets, or `null` when its sequence or payload isn't valid. */
function parseProductState(command: CloudCommand) {
  const { sequence, payload } = command;
  if (sequence === null || !Number.isSafeInteger(sequence) || sequence < 0) return null;
  const keys = Object.keys(payload);
  if (keys.length !== 2 || !Object.hasOwn(payload, "state")) return null;
  const { state, changedAt } = payload;
  if (!linkStates.includes(state as CloudLinkState)) return null;
  if (typeof changedAt !== "string" || !isIsoTime(changedAt)) return null;
  return { state: state as CloudLinkState, sequence, changedAt };
}

function isIsoTime(text: string): boolean {
  return isoTimePattern.test(text) && !Number.isNaN(Date.parse(text));
}
