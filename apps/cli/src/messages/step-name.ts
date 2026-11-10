/**
 * How a step is named in the live lines, the waiting line, `runs show` and
 * the `runs` list (cli-output 3.4, revision 17): its description's first
 * line, else its id with a capital, the same rule as Studio's run page.
 *
 * @example
 * stepName("review", "Approve this reply?\nCheck the tone first."); // "Approve this reply?"
 * stepName("review"); // "Review"
 */
export function stepName(stepId: string, description?: string): string {
  const firstLine = description?.split("\n")[0]?.trim() ?? "";
  if (firstLine !== "") {
    return firstLine;
  }
  return stepId.charAt(0).toUpperCase() + stepId.slice(1);
}
