import { CronError } from "./cron-error.ts";

/** The allowed values of one cron field, and the names that stand for them. */
export interface FieldRange {
  min: number;
  max: number;
  /** Names in value order, such as `jan` for the first value. */
  names?: readonly string[];
  /** The value of the first name: 1 for months (`jan` = 1), 0 for weekdays (`sun` = 0). */
  firstNameValue?: number;
}

/** One parsed cron field. */
export interface ParsedField {
  values: Set<number>;
  /** The field was a bare `*`, so it doesn't restrict anything. */
  any: boolean;
}

const WHOLE_NUMBER = /^\d+$/;

/**
 * Parses one field of a cron expression: `*`, a value, a range `1-5`, a step
 * `*\/15`, `8-18/2` or `5/10` (from 5 to the end), or a comma list of those.
 *
 * @throws {CronError} when a part is malformed or outside the field's range
 */
export function parseCronField(text: string, range: FieldRange): ParsedField {
  const values = new Set<number>();
  for (const part of text.split(",")) {
    for (const value of partValues(part, range)) values.add(value);
  }
  return { values, any: text === "*" };
}

function partValues(part: string, range: FieldRange): number[] {
  const pieces = part.split("/");
  const span = pieces[0];
  if (pieces.length > 2 || !span) throw new CronError(`Bad part "${part}"`);
  const stepText = pieces[1];
  const step = stepText === undefined ? 1 : parseStep(stepText, part);

  const { low, high } = spanBounds(span, part, stepText !== undefined, range);
  if (low < range.min || high > range.max || low > high) {
    throw new CronError(`"${part}" is outside ${range.min}-${range.max}`);
  }
  const values: number[] = [];
  for (let value = low; value <= high; value += step) values.push(value);
  return values;
}

function parseStep(stepText: string, part: string): number {
  if (!WHOLE_NUMBER.test(stepText) || Number(stepText) < 1) {
    throw new CronError(`Bad step in "${part}"`);
  }
  return Number(stepText);
}

// A single value with a step ("5/10") runs to the end of the field, as in
// classic cron; without a step it is just that value.
function spanBounds(
  span: string,
  part: string,
  hasStep: boolean,
  range: FieldRange,
): { low: number; high: number } {
  if (span === "*") return { low: range.min, high: range.max };
  const ends = span.split("-");
  if (ends.length === 1) {
    const value = fieldValue(span, range);
    return { low: value, high: hasStep ? range.max : value };
  }
  if (ends.length !== 2 || ends.includes("")) {
    // Name the whole part too when a step hides behind the range ("1-/5").
    const where = span === part ? "" : ` in "${part}"`;
    throw new CronError(`Bad range "${span}"${where}`);
  }
  return { low: fieldValue(ends[0] ?? "", range), high: fieldValue(ends[1] ?? "", range) };
}

function fieldValue(text: string, range: FieldRange): number {
  const nameIndex = range.names?.indexOf(text.toLowerCase()) ?? -1;
  if (nameIndex >= 0) return nameIndex + (range.firstNameValue ?? 0);
  if (!WHOLE_NUMBER.test(text)) throw new CronError(`"${text}" is not a number`);
  return Number(text);
}
