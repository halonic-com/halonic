import type { AccountType } from "@halonicjs/google-setup";

/** How an account type reads in the header's first line. */
export const accountTypeNames: Readonly<Record<AccountType, string>> = {
  personal: "Personal Google account",
  workspace: "Work or school account (Google Workspace)",
};

/** The address the question links to, for an owner who can't tell. */
export const adminConsoleUrl = "https://admin.google.com";

/** "Gmail and Drive": the ticked services, in the order Studio shows them. */
export function listNames(names: readonly string[]): string {
  return new Intl.ListFormat("en").format(names);
}
