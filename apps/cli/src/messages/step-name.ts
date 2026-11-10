/**
 * How a step is named in the live lines, the waiting line, `runs show` and
 * the `runs` list (cli-output 3.4, revision 17): the first line of its
 * description, trimmed, else its id with only the first letter made a
 * capital. The rest of the id stays as it is, with no title case.
 *
 * @example
 * stepName("read", "Read the email"); // "Read the email"
 * stepName("review", "Approve this reply?\n{{context.reply}}"); // "Approve this reply?"
 * stepName("classify"); // "Classify"
 */
export function stepName(stepId: string, description?: string): string {
  const firstLine = description?.split("\n")[0]?.trim() ?? "";
  if (firstLine !== "") {
    return firstLine;
  }
  return stepId.charAt(0).toUpperCase() + stepId.slice(1);
}
