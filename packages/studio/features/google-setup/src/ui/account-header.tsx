import type { AccountType } from "@halonicjs/google-setup";
import { Button, Callout, type CalloutHandle, StatusChip } from "@halonicjs/studio-kit";
import { useEffect, useId, useRef, useState } from "react";
import { accountTypeNames, listNames } from "./account-labels.ts";
import { AccountTypeQuestion } from "./account-type-question.tsx";
import { failureLine } from "./failure-line.ts";
import { OtherWays } from "./other-ways.tsx";

/** Props for {@link AccountHeader}. */
export interface AccountHeaderProps {
  readonly email: string;
  /** The ticked services' names, in the order Studio shows them. */
  readonly serviceNames: readonly string[];
  readonly accountType: AccountType;
  /** True until a non-Gmail address has been asked what kind of account it is. */
  readonly asking: boolean;
  /** "Step 3 of 7", or none while the question is open. */
  readonly progress: string | undefined;
  readonly answering: boolean;
  /** Saves the account type. It rejects when it can't be saved. */
  readonly onAccountType: (accountType: AccountType) => Promise<void>;
}

/**
 * The item's header: "SETUP Google for x@example.com" and the step it is at, then the services
 * and the account type with **Change**, then the route line. An address Studio can't tell is
 * asked once, in place of the first line.
 */
export function AccountHeader(props: AccountHeaderProps) {
  const { email, serviceNames, accountType, asking, progress, answering, onAccountType } = props;
  const [changing, setChanging] = useState(false);
  const [failed, setFailed] = useState<string | undefined>(undefined);
  const retry = useRef<() => void>(() => {});
  const callout = useRef<CalloutHandle>(null);
  const typeLine = useId();
  const changeButton = useRef<HTMLButtonElement>(null);
  // Set when the question closes after **Change**, so focus goes back to it once it is drawn.
  const returnFocus = useRef(false);

  useEffect(() => {
    if (!changing && returnFocus.current) {
      returnFocus.current = false;
      changeButton.current?.focus();
    }
  }, [changing]);

  // A failure that appears because of what you did takes focus, so a screen reader reads it.
  useEffect(() => {
    if (failed !== undefined) callout.current?.focus();
  }, [failed]);

  function closeQuestion() {
    returnFocus.current = true;
    setFailed(undefined);
    setChanging(false);
  }

  async function pick(next: AccountType) {
    if (!answering) return;
    setFailed(undefined);
    try {
      await onAccountType(next);
      if (changing) closeQuestion();
    } catch (error) {
      setFailed(failureLine("save the account type", error));
      retry.current = () => void pick(next);
    }
  }

  return (
    <header className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <StatusChip tone="outline">Setup</StatusChip>
          <h2 className="text-title">Google for {email}</h2>
        </div>
        {progress === undefined ? null : (
          <span className="shrink-0 text-body text-fg-muted">{progress}</span>
        )}
      </div>
      {asking || changing ? (
        <>
          <AccountTypeQuestion
            email={email}
            value={asking ? null : accountType}
            answering={answering}
            onChange={(next) => void pick(next)}
          />
          {asking ? null : (
            <div>
              <Button variant="secondary" size="sm" onClick={closeQuestion}>
                Cancel
              </Button>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-x-2">
          <p id={typeLine} className="text-body">
            For {listNames(serviceNames)}
            <span aria-hidden="true"> · </span>
            <span className="sr-only">, </span>
            {accountTypeNames[accountType]}
          </p>
          <Button
            ref={changeButton}
            variant="ghost"
            size="sm"
            aria-describedby={typeLine}
            onClick={() => setChanging(true)}
          >
            Change
          </Button>
        </div>
      )}
      {failed === undefined ? null : (
        <Callout
          tone="danger"
          announce="focus"
          ref={callout}
          action={{ label: "Try again", onClick: () => retry.current() }}
        >
          {failed}
        </Callout>
      )}
      <div className="flex flex-wrap items-center gap-x-2">
        <p className="text-body">Uses your own Google app, on this computer.</p>
        <OtherWays services={listNames(serviceNames, "or")} />
      </div>
    </header>
  );
}
