import type { AccountType } from "@halonicjs/google-setup";
import { ExternalLink, Field, RadioGroup, type RadioOption } from "@halonicjs/studio-kit";
import { adminConsoleUrl } from "./account-labels.ts";

/** Props for {@link AccountTypeQuestion}. */
export interface AccountTypeQuestionProps {
  /** The Google account's address, which the question names. */
  readonly email: string;
  /** The answer so far, or `null` before the first one. */
  readonly value: AccountType | null;
  /** False while the engine isn't answering: the answers stay listed, with the reason. */
  readonly answering: boolean;
  /** Saves the answer at once. */
  readonly onChange: (accountType: AccountType) => void;
}

/**
 * "What kind of Google account is …?", as a radio group in the header (UX checklist U4): the
 * arrow keys move between the two answers, and nothing below opens until one is picked.
 */
export function AccountTypeQuestion(props: AccountTypeQuestionProps) {
  const { email, value, answering, onChange } = props;
  // The same rule as **Done, next**: an answer that can't be saved stays listed, with the reason.
  const option = (value: AccountType, label: string, note: string): RadioOption<AccountType> =>
    answering
      ? { value, label, note }
      : { value, label, note: "The engine isn't answering.", unavailable: true };
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
          option(
            "workspace",
            "Work or school account (Google Workspace)",
            "Your organisation manages it. It has an admin.",
          ),
          option(
            "personal",
            "Personal Google account",
            "You created it yourself, even if it uses your own domain.",
          ),
        ]}
      />
    </Field>
  );
}
