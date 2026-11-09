/**
 * Names every `Secrets` and `TokenStore` method must refuse with a
 * `RangeError`: not `^[A-Za-z][A-Za-z0-9_-]*$`, or longer than 128 characters.
 */
export const invalidSecretNames: readonly string[] = [
  "",
  "1password",
  "_token",
  "-token",
  "serve password",
  "serve.password",
  "../serve-password",
  "serve/password",
  "sérve",
  "token\n",
  `a${"b".repeat(128)}`,
];

/** The longest valid name: 128 characters. */
export const longestSecretName = `a${"b".repeat(127)}`;

/**
 * Bad names an error must not repeat, each with a part of it to look for in
 * the message: one over 128 characters (more likely a value passed as a name
 * by mistake) and ones with characters that aren't printable ASCII.
 */
export const unquotableSecretNames: ReadonlyArray<{
  readonly name: string;
  readonly part: string;
}> = [
  { name: `value${"q".repeat(130)}`, part: "qqqq" },
  { name: "s\u00e9rve-password", part: "rve-password" },
  { name: "serve\npassword", part: "password" },
];
