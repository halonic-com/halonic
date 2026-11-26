import { isSafeSegment } from "./requests.ts";

/**
 * What a write's body must be: an object with exactly `fields`, every field
 * a non-empty string (or `null` for one listed in `nullable`, or a list of
 * exactly one safe ID for one listed in `idLists`), its `status` field set to
 * `status` and each `pinned` field set to its value.
 */
export interface BodyRule {
  fields: readonly string[];
  status?: string;
  pinned?: Readonly<Record<string, string>>;
  nullable?: readonly string[];
  idLists?: readonly string[];
  /** Fields that must be a whole number from 1 to Paperclip's limit, such as a budget in cents. */
  integers?: readonly string[];
  /** Fields whose text must start with the given prefix and go on after it. */
  prefixed?: Readonly<Record<string, string>>;
  /** Fields that must be `true` or `false`, such as whether a reaction is added. */
  booleans?: readonly string[];
}

/** The largest amount Paperclip's resolve route takes: its column is a 32-bit integer. */
const largestAmount = 2_147_483_647;

/**
 * Whether `body` fits `rule`: exactly the rule's fields, each a non-empty
 * string, a `null` the rule allows, a boolean or a whole number the rule asks
 * for, with the rule's status, pinned values and prefixes.
 */
export function fitsBodyRule(rule: BodyRule, body: unknown): boolean {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return false;
  }
  const fields = new Map<string, unknown>(Object.entries(body));
  const onlyRuleFields =
    fields.size === rule.fields.length && rule.fields.every((field) => fields.has(field));
  const allText = [...fields].every(([field, value]) => fieldFits(rule, field, value));
  const allPrefixed = Object.entries(rule.prefixed ?? {}).every(([field, prefix]) => {
    const value = fields.get(field);
    return typeof value === "string" && value.startsWith(prefix) && value.length > prefix.length;
  });
  const pinned = Object.entries({
    ...(rule.status === undefined ? {} : { status: rule.status }),
    ...rule.pinned,
  });
  return (
    onlyRuleFields &&
    allText &&
    allPrefixed &&
    pinned.every(([field, value]) => fields.get(field) === value)
  );
}

/** Whether one field's value fits `rule`: one-ID list, whole number, or text (or an allowed `null`). */
function fieldFits(rule: BodyRule, field: string, value: unknown): boolean {
  if (rule.idLists?.includes(field) === true) {
    return isOneIdList(value);
  }
  if (rule.booleans?.includes(field) === true) {
    return typeof value === "boolean";
  }
  if (rule.integers?.includes(field) === true) {
    return Number.isSafeInteger(value) && Number(value) >= 1 && Number(value) <= largestAmount;
  }
  return (
    (typeof value === "string" && value !== "") ||
    (value === null && rule.nullable?.includes(field) === true)
  );
}

/** Whether `value` is a list of exactly one ID that is a safe segment, such as one label. */
function isOneIdList(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length === 1 &&
    typeof value[0] === "string" &&
    isSafeSegment(value[0])
  );
}
