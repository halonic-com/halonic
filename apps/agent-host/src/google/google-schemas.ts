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
