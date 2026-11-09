/**
 * A non-empty string field of a JSON object from Google's answer, or
 * `undefined` when it is missing, empty or not a string.
 *
 * @param json - the parsed answer
 * @param name - the field's name
 */
export function textField(json: Record<string, unknown>, name: string): string | undefined {
  const value = json[name];
  return typeof value === "string" && value !== "" ? value : undefined;
}
