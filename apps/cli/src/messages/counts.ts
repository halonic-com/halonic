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
