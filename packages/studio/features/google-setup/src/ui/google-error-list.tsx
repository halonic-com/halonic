import type { AccountType, StepId } from "@halonicjs/google-setup";
import { Button, CopyButton, Disclosure } from "@halonicjs/studio-kit";
import { type ErrorAction, errorRows } from "./google-error-rows.ts";

/** Props for {@link GoogleErrorList}. */
export interface GoogleErrorListProps {
  readonly accountType: AccountType | null;
  /** The connector's address, for the row that says which account to choose. */
  readonly email: string;
  /** The note for the admin, for the row about an admin block. */
  readonly adminNote: string;
  readonly onOpenStep: (step: StepId) => void;
  /** Clears the "In production" tick, so step 3 asks for it again. */
  readonly onClearInProduction: () => void;
}

/**
 * **Google showed an error instead?** (design 5.1), folded under the waiting state. When Google
 * stops on its own error page it never comes back to Halonic, so the step can't know. It lists the
 * errors a person can read on that page, each with its fix. Folded, so it doesn't look as if
 * something went wrong when it didn't.
 */
export function GoogleErrorList(props: GoogleErrorListProps) {
  const { accountType, email } = props;
  function run(action: ErrorAction) {
    if (action.kind === "open-step") {
      props.onOpenStep(action.step);
    } else if (action.kind === "reopen-consent") {
      props.onClearInProduction();
      props.onOpenStep("consent");
    }
  }
  return (
    <Disclosure summary="Google showed an error instead?">
      <ul className="flex flex-col gap-3 p-4 text-body">
        {errorRows(accountType, email).map((row) => (
          <li key={row.code} className="flex flex-col items-start gap-1">
            <strong className="text-body-strong">{row.code}</strong>
            <span>{row.fix}</span>
            {row.actions.length === 0 ? null : (
              <span className="flex flex-wrap gap-2">
                {row.actions.map((action) =>
                  action.kind === "copy-note" ? (
                    <CopyButton
                      key="copy-note"
                      text={props.adminNote}
                      label="Copy a note for your admin"
                    />
                  ) : (
                    <Button
                      key={action.label}
                      variant="ghost"
                      size="sm"
                      onClick={() => run(action)}
                    >
                      {action.label}
                    </Button>
                  ),
                )}
              </span>
            )}
          </li>
        ))}
      </ul>
    </Disclosure>
  );
}
