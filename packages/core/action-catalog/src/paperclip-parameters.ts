import type { TextParameter } from "@halonicjs/action-steppers";

// Shared by the Paperclip Secrets definitions. It sits next to src/paperclip/,
// not in it, because every file in a service folder is a definition.

/** A Paperclip's host name, as the user connected it. Pages open only there, over `https`. */
export const paperclipHost: TextParameter = {
  kind: "text",
  pattern: /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?){1,8}$/,
};

/** The company's prefix in Paperclip's addresses, such as `ACME` in `https://paperclip.acme.example/ACME/…`. */
export const paperclipCompany: TextParameter = { kind: "text", pattern: /^[A-Za-z0-9]{1,16}$/ };

/** A secret's name, environment-variable style, as agents read it: `ANTHROPIC_API_KEY`. */
export const secretName: TextParameter = { kind: "text", pattern: /^[A-Z][A-Z0-9_]{0,63}$/ };

/** The Paperclip Secrets page of one company. */
export const secretsPage = "https://{host}/{company}/company/settings/secrets";
