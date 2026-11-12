import type { AccountType } from "@halonicjs/google-setup";
import { Button, StatusChip } from "@halonicjs/studio-kit";
import { useId, useState } from "react";
import { accountTypeNames, listNames } from "./account-labels.ts";
import { AccountTypeQuestion } from "./account-type-question.tsx";
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
  const [failed, setFailed] = useState(false);
  const typeLine = useId();

  async function pick(next: AccountType) {
    if (!answering) return;
    setFailed(false);
    try {
      await onAccountType(next);
      setChanging(false);
    } catch {
      setFailed(true);
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
        <AccountTypeQuestion
          email={email}
          value={asking ? null : accountType}
          onChange={(next) => void pick(next)}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-x-2">
          <p id={typeLine} className="text-body">
            For {listNames(serviceNames)} · {accountTypeNames[accountType]}
          </p>
          <Button
            variant="ghost"
            size="sm"
            aria-describedby={typeLine}
            onClick={() => setChanging(true)}
          >
            Change
          </Button>
        </div>
      )}
      {failed ? (
        <p role="alert" className="text-body text-danger">
          Couldn't save that. Try again.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-2">
        <p className="text-body">Uses your own Google app, on this computer.</p>
        <OtherWays services={listNames(serviceNames)} />
      </div>
    </header>
  );
}
