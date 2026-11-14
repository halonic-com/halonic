/**
 * A Google OAuth client ID, such as `1234-abc.apps.googleusercontent.com`.
 * Only lower-case letters, digits and the fixed ending, so a client secret
 * pasted into the wrong field (`GOCSPX-…`) can never be saved as one.
 */
const clientIdPattern = /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/;

/**
 * Whether the text has the shape of a Google OAuth client ID. The setup record
 * accepts no other `clientId`, and Studio's client ID field uses the same check
 * to say what is wrong before it saves.
 *
 * @example
 * isClientId("1234-abc.apps.googleusercontent.com"); // true
 * isClientId("GOCSPX-abc123"); // false
 */
export function isClientId(text: string): boolean {
  return clientIdPattern.test(text);
}
