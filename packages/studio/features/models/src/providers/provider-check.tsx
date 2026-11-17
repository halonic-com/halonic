import type { Provider } from "@halonicjs/format";
import { Button } from "@halonicjs/studio-kit";
import { useEffect, useRef, useState } from "react";
import type { ProviderCheck } from "../api.ts";
import { providerName } from "./provider-rows.ts";
import {
  CHECK,
  CHECK_HINT,
  CHECKING,
  checkAnnouncement,
  checkResultLine,
} from "./provider-text.ts";

/** The props of {@link CheckProvider}. */
export interface CheckProviderProps {
  /** The app's check; without it there is no Check. */
  readonly check: ProviderCheck | undefined;
  readonly provider: Provider;
  /** The time a result is stamped with; the page's clock unless a test gives one. */
  readonly now?: () => Date;
}

/** The result of the last check, and which check it was. */
interface Result {
  readonly count: number;
  readonly answering: boolean;
  readonly address: string;
  readonly checkedAt: string;
}

/** "10:42", in the computer's own clock. */
function clockTime(date: Date): string {
  const two = (value: number) => String(value).padStart(2, "0");
  return `${two(date.getHours())}:${two(date.getMinutes())}`;
}

/**
 * **Check** on a provider that runs on this computer or your own network
 * (`models.providers.check`): one secondary button, and under it one status line with the last
 * result. The button reads "Checking…" and stays focused while it asks. The result lasts until the
 * page closes; it is not written to a file. Nothing shows for a cloud provider or one with no
 * address.
 *
 * @example
 * <CheckProvider check={check} provider={provider} />
 */
export function CheckProvider({ check, provider, now = () => new Date() }: CheckProviderProps) {
  const [result, setResult] = useState<Result>();
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const address = check?.addressOf(provider);
  // A result for another address (the base URL was edited since) is no longer the answer.
  const current = result?.address === address ? result : undefined;
  if (check === undefined || !provider.local || address === undefined) return null;

  async function run(asked: ProviderCheck, where: string) {
    setBusy(true);
    const answering = await asked.isAnswering(provider);
    if (!alive.current) return;
    const checkedAt = clockTime(now());
    setResult({ count: (result?.count ?? 0) + 1, answering, address: where, checkedAt });
    setBusy(false);
  }

  return (
    <section className="flex flex-col gap-2">
      <div>
        <Button
          variant="secondary"
          busy={busy}
          busyLabel={CHECKING}
          onClick={() => void run(check, address)}
        >
          {CHECK}
        </Button>
      </div>
      {current === undefined ? null : (
        <p className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={`size-2 shrink-0 rounded-full ${current.answering ? "bg-success" : "border border-fg-muted"}`}
          />
          {checkResultLine(current.answering, current.address, current.checkedAt)}
        </p>
      )}
      {/* Mounted from the start, so a screen reader hears its text change; the span inside is new
          for each check, so a result that is the same as before is announced again. */}
      <p role="status" className="sr-only">
        {current === undefined ? null : (
          <span key={current.count}>
            {checkAnnouncement(
              providerName(provider),
              current.answering,
              current.address,
              current.checkedAt,
            )}
          </span>
        )}
      </p>
      <p className="text-small text-fg-muted">{CHECK_HINT}</p>
    </section>
  );
}
