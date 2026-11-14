import type { TokenKind } from "./api.ts";

/** Reads the kind from the token's prefix: `cfut_` user, `cfat_` account, anything else legacy. */
export function tokenKind(token: string): TokenKind {
  if (token.startsWith("cfut_")) return "user";
  if (token.startsWith("cfat_")) return "account";
  return "legacy";
}
