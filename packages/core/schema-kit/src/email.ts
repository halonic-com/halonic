// Kept as text so the formatter can't respell it: its exact source is
// published as the `pattern` of email fields in the JSON Schemas.
const EMAIL_SOURCE =
  "^(?:[A-Za-z0-9_'+\\-]+\\.)*[A-Za-z0-9_'+\\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\\-]*\\.)+[A-Za-z]{2,}$";

/**
 * The email rule Zod 4 used, so workspaces that validated before still do:
 * dot-separated name parts of letters, digits and `_ ' + -`, an `@`, and a
 * domain whose last part has at least two letters. Quoted names and IP
 * address domains are not accepted.
 */
export const EMAIL_PATTERN = new RegExp(EMAIL_SOURCE);
