import type { AccountType } from "@halonicjs/google-setup";
import { ExternalLink, Field, RadioGroup } from "@halonicjs/studio-kit";
import { adminConsoleUrl } from "./account-labels.ts";

/** Props for {@link AccountTypeQuestion}. */
export interface AccountTypeQuestionProps {
  /** The Google account's address, which the question names. */
  readonly email: string;
  /** The answer so far, or `null` before the first one. */
  readonly value: AccountType | null;
  /** Saves the answer at once. */
  readonly onChange: (accountType: AccountType) => void;
}

/**
 * "What kind of Google account is …?", as a radio group in the header (UX checklist U4): the
 * arrow keys move between the two answers, and nothing below opens until one is picked.
 */
export function AccountTypeQuestion({ email, value, onChange }: AccountTypeQuestionProps) {
  return (
    <Field
      label={`What kind of Google account is ${email}?`}
      hint={
        <>
          Not sure? Ask whoever set up your e-mail, or open{" "}
          <ExternalLink href={adminConsoleUrl}>admin.google.com</ExternalLink>: if it says you're
          not an administrator, it's a Workspace account.
        </>
      }
    >
      <RadioGroup
        value={value}
        onChange={onChange}
        options={[
          {
            value: "workspace",
            label: "Work or school account (Google Workspace)",
            note: "Your organisation manages it. It has an admin.",
          },
          {
            value: "personal",
            label: "Personal Google account",
            note: "You created it yourself, even if it uses your own domain.",
          },
        ]}
      />
    </Field>
  );
}
