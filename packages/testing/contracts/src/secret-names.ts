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
  // Attack cases (HAL-2899): paths, control and invisible characters, padding, a huge name.
  "..",
  "serve\\password",
  "serve\u0000password",
  "serve-password\u0000",
  "serve-password ",
  "serve\u200Dpassword",
  "\uFF53\uFF45\uFF52\uFF56\uFF45",
  `a${"b".repeat(10_000)}`,
];

/**
 * Names that look like, or fold under Unicode case mapping onto, a valid
 * name: `serve-password` or `api-key`. Each breaks the rule, so it must be a
 * `RangeError`, never the other secret. `ſ` upper-cases to `S`, `ı` to `I`,
 * and the Kelvin sign lower-cases to `k`.
 */
export const lookalikeSecretNames: readonly string[] = [
  "\u017Ferve-password",
  "s\u0435rve-password",
  "serve\u2010password",
  "serve\uFF3Fpassword",
  "\u0430pi-key",
  "ap\u0131-key",
  "api-\u212Aey",
];

/**
 * Valid names that are also properties of every JavaScript object. A store
 * that looks names up in a plain object would answer these without a value.
 */
export const objectPropertySecretNames: readonly string[] = [
  "constructor",
  "toString",
  "hasOwnProperty",
  "valueOf",
  "isPrototypeOf",
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
  { name: "serve\u0000password", part: "password" },
];
