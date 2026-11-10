// moves to words.ts after #725, which adds `countInWords` there.
const smallCounts = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
];

/**
 * A count as a sentence says it: "two" up to nine, digits from 10, as in
 * "you gave two: a, b".
 *
 * @example
 * countInWords(2); // "two"
 * countInWords(12); // "12"
 */
export function countInWords(count: number): string {
  return smallCounts[count] ?? String(count);
}

/**
 * How many times something happened, as a sentence says it: "once", "twice",
 * then digits, as in "asked you once" or "tried 3 times".
 *
 * @example
 * timesInWords(1); // "once"
 * timesInWords(3); // "3 times"
 */
export function timesInWords(times: number): string {
  if (times === 1) {
    return "once";
  }
  return times === 2 ? "twice" : `${times} times`;
}

/**
 * Names as a sentence lists them: commas, with "and" (or "or") before the
 * last (cli-output 3.4, revision 25). An empty list reads "nothing", as the
 * receipt's "sent nothing" does, so a sentence never has a gap where the
 * names should be.
 *
 * @example
 * listInWords(["Read mail", "Classify", "Closed"]); // "Read mail, Classify and Closed"
 * listInWords(["approve", "reject"], "or"); // "approve or reject"
 * listInWords(["reply.md"]); // "reply.md"
 * listInWords([]); // "nothing"
 */
export function listInWords(names: readonly string[], last: "and" | "or" = "and"): string {
  if (names.length === 0) {
    return "nothing";
  }
  if (names.length === 1) {
    return names.join("");
  }
  return `${names.slice(0, -1).join(", ")} ${last} ${names.at(-1)}`;
}

/**
 * A count with its noun, in digits: "1 warning", "14 files". The plural is
 * passed in, because English plurals aren't all an added "s".
 *
 * @example
 * counted(1, "file", "files"); // "1 file"
 * counted(14, "file", "files"); // "14 files"
 */
export function counted(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}
