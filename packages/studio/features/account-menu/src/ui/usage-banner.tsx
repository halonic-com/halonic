import { BarsIcon, Button, CloseIcon } from "@halonicjs/studio-kit";
import { pageHeading, type StripProps } from "@halonicjs/studio-shell";
import { useEffect, useId, useState } from "react";
import { type AccountMenuHost, AccountMenuHostService, type UsageWarning } from "../api.ts";
import { unitName } from "../unit-words.ts";
import { bannerWarning, UsageBannerMemory } from "../usage-banner-memory.ts";
import { resetDay, usageBannerWords } from "./usage-banner-words.ts";

/**
 * The 80% banner under the top bar (`account-menu.usage-banner`, flow C3, board 10's first row):
 * "You've used 80% of this month's agent time · It resets on 2 December." with **See usage**,
 * which opens the account page's plan section, and a close button. It shows the highest unit at
 * 80% or more and under 100%, once per unit and period: closing it is remembered on this device.
 * Without a host, while loading, when the computer can't say or once signed out, it draws nothing.
 * A section named by its sentence, so the landmark list finds it as a region; not a live one, so
 * a load doesn't read it out (the design says quiet).
 */
export function UsageBanner({ context }: StripProps) {
  const host = context.services.find(AccountMenuHostService);
  const shown = useShownWarning(host);
  const titleId = useId();
  if (host === undefined || shown.warning === undefined) {
    return null;
  }
  const { warning, planUrl } = shown;
  const name = unitName(warning.unit) ?? warning.unit;
  const close = () => {
    shown.close(warning);
    // The close button goes with the banner, so its focus would fall to the body.
    const start = pageHeading() ?? document.querySelector<HTMLElement>("main");
    if (start === null) return;
    if (!start.hasAttribute("tabindex")) start.tabIndex = -1;
    start.focus({ preventScroll: true });
  };
  return (
    <section aria-labelledby={titleId} className="px-4 pt-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border bg-surface px-4 py-2.5 text-body">
        <span
          aria-hidden="true"
          className="inline-grid size-icon-sm shrink-0 text-fg-muted *:size-full"
        >
          <BarsIcon />
        </span>
        <p id={titleId} className="min-w-0 flex-1 basis-60 text-fg">
          <strong className="font-semibold">{usageBannerWords.title(name)}</strong>
          {" · "}
          {usageBannerWords.resets(resetDay(warning.resetsAt))}
        </p>
        <div className="ms-auto flex shrink-0 items-center gap-1">
          <Button size="sm" aria-describedby={titleId} onClick={() => host.open(planUrl)}>
            {usageBannerWords.seeUsage}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={<CloseIcon />}
            label={usageBannerWords.close}
            aria-describedby={titleId}
            onClick={close}
          />
        </div>
      </div>
    </section>
  );
}

/** The warning to show, if any, with the plan address, and how to close it. */
function useShownWarning(host: AccountMenuHost | undefined) {
  const [facts, setFacts] = useState<{ warnings: readonly UsageWarning[]; planUrl: string }>();
  const [memory] = useState(() => new UsageBannerMemory(globalThis.localStorage ?? null));
  const [, setClosedCount] = useState(0);
  useEffect(() => {
    if (host === undefined || host.signedOutOf() !== null) {
      return;
    }
    let live = true;
    host.load().then(
      (loaded) => {
        if (live && loaded !== null) setFacts(loaded);
      },
      // The account menu says why too; the banner just stays away.
      (error: unknown) => console.error("Couldn't read the usage for the banner.", error),
    );
    const stopListening = host.onSignedOut(() => setFacts(undefined));
    return () => {
      live = false;
      stopListening();
    };
  }, [host]);
  const warning =
    facts === undefined
      ? undefined
      : bannerWarning(
          facts.warnings,
          (one) => memory.isClosed(one),
          (unit) => unitName(unit) !== undefined,
        );
  const close = (closed: UsageWarning) => {
    memory.close(closed);
    setClosedCount((count) => count + 1);
  };
  return { warning, planUrl: facts?.planUrl ?? "", close };
}
