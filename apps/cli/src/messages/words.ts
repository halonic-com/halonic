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
