import { s } from "@halonicjs/schema-kit";

/** An integration's id or a sign-in's name, as a sheet writes them: lower-case words joined by `-`. Nothing else gets into a lookup. */
const sheetName = s
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u);

/** What Studio gives to start, cancel or sign out one sign-in. */
export const signInBody = s.object({ integration: sheetName, signIn: sheetName }).strict();

/** What Studio gives to ask where an integration's sign-ins stand. */
export const integrationBody = s.object({ integration: sheetName }).strict();
