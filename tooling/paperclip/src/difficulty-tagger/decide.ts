/**
 * Whether the difficulty tagger may tag a task, and the labels it ends up
 * with (requirement `paperclip.difficulty-tagger-labels`). A label someone
 * else set always wins: the tagger only ever replaces its own.
 */

/** What the tagger keeps per task: a hash of the text it read, never the text. */
export interface TaggerRecord {
  /** The hash of the title and description start the tagger last read. */
  readonly textHash: string;
  /** The tag labels it answered with, lower case. */
  readonly labels: readonly string[];
  /** Whether those labels went onto the task, or were only logged with the switch off. */
  readonly written: boolean;
}

/** Labels the tagger writes or a person may set instead: difficulty and risk. */
const tagLabels: ReadonlySet<string> = new Set(["d1", "d2", "d3", "d4", "d5", "opus-only"]);

function key(name: string): string {
  return name.trim().toLowerCase();
}

/** The task's difficulty and `opus-only` labels, lower case. */
export function tagsOn(labelNames: readonly string[]): string[] {
  return labelNames.map(key).filter((name) => tagLabels.has(name));
}

/** The labels the tagger put on the task and that are still its own. */
function ownLabels(record: TaggerRecord | undefined): readonly string[] {
  return record?.written === true ? record.labels : [];
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((name) => b.includes(name));
}

/**
 * True when the task carries a difficulty or `opus-only` label the tagger
 * didn't write: someone tagged it by hand, so the tagger leaves it alone.
 */
export function handTagged(
  labelNames: readonly string[],
  record: TaggerRecord | undefined,
): boolean {
  const tags = tagsOn(labelNames);
  return tags.length > 0 && !sameSet(tags, ownLabels(record));
}

/**
 * Whether the tagger asks the model about the task: not when someone tagged
 * it by hand, and not again for text it already read, unless the switch
 * changed since (so turning it on tags the tasks it only logged).
 */
export function shouldTag(
  labelNames: readonly string[],
  textHash: string,
  record: TaggerRecord | undefined,
  writesOn: boolean,
): boolean {
  if (handTagged(labelNames, record)) {
    return false;
  }
  return record === undefined || record.textHash !== textHash || record.written !== writesOn;
}

/** The task's label names with the tagger's own swapped for `answer`; every other label stays. */
export function labelsAfter(
  labelNames: readonly string[],
  answer: readonly string[],
  record: TaggerRecord | undefined,
): string[] {
  const own = ownLabels(record);
  const kept = labelNames.filter((name) => !own.includes(key(name)));
  const added = answer.filter((name) => !kept.some((label) => key(label) === key(name)));
  return [...kept, ...added];
}
