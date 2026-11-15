import type { AccountType, StepId } from "@halonicjs/google-setup";

/** What a row's button does: open a step, open step 3 after clearing the "In production" tick, or copy the note for the admin. */
export type ErrorAction =
  | { readonly kind: "open-step"; readonly step: StepId; readonly label: string }
  | { readonly kind: "reopen-consent"; readonly label: string }
  | { readonly kind: "copy-note" };

/** One error a person can meet on Google's own page: what the page says, and the fix. */
export interface ErrorRow {
  /** What Google's page shows, as the person reads it there. */
  readonly code: string;
  readonly fix: string;
  readonly actions: readonly ErrorAction[];
}

/**
 * The errors Google shows in the browser instead of coming back to Halonic (design 5.1). For these
 * Studio can't tell what happened, so it lists them next to the waiting state, matched on the code
 * the person can read on Google's page. The two rows that only a Workspace account can meet are
 * left out for a personal account (UX checklist U11).
 */
export function errorRows(accountType: AccountType | null, email: string): ErrorRow[] {
  const rows: ErrorRow[] = [
    {
      code: "Error 401: invalid_client",
      fix: "The client ID isn't right. Copy it again from your client's page into step 6, then sign in again.",
      actions: [{ kind: "open-step", step: "credentials", label: "Open step 6" }],
    },
    {
      code: "Error 400: redirect_uri_mismatch",
      fix: "Your client is the wrong type. Create a new one with Application type Desktop app (step 5) and paste its ID and secret.",
      actions: [
        { kind: "open-step", step: "client", label: "Open step 5" },
        { kind: "open-step", step: "credentials", label: "Open step 6" },
      ],
    },
    {
      code: "Error 403: access_denied",
      fix: "Your app is still in Testing. Publish it on the Audience page (step 3c).",
      actions: [{ kind: "reopen-consent", label: "Open step 3" }],
    },
  ];
  if (accountType !== "workspace") return rows;
  return [
    ...rows,
    {
      code: "Error 403: org_internal",
      fix: `This app only accepts accounts in your organisation. Choose ${email} when Google asks.`,
      actions: [],
    },
    {
      code: "admin_policy_enforced",
      fix: "Your organisation's admin hasn't allowed this app yet. This is set by your admin, not by Halonic.",
      actions: [{ kind: "copy-note" }],
    },
  ];
}
