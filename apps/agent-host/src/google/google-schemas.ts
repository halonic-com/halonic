import { s } from "@halonicjs/schema-kit";

/**
 * A Google account's ref, as the setup record names it: lower-case words
 * joined by `_`. Nothing else gets into the path the host builds from it.
 */
const accountRef = s
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/u);

/** What Studio gives to change an account's setup: its ref, never a path or a token. */
export const accountRefBody = s.object({ accountRef }).strict();

/** What Studio gives to start a setup: the connector it is for, and the kind of Google account. */
export const startSetupBody = s
  .object({
    accountType: s.enum(["workspace", "personal"]),
    connector: s
      .object({ workspace: s.string().min(1).max(128), id: s.string().min(1).max(128) })
      .strict(),
  })
  .strict();

/**
 * What Studio gives to change a setup: the ref and one edit. The edit's own
 * fields are checked by the handler, which accepts only what a person
 * changes, never what the host records (sign-in, secret, service checks).
 */
export const editSetupBody = s
  .object({ accountRef, change: s.record(s.string(), s.unknown()) })
  .strict();
