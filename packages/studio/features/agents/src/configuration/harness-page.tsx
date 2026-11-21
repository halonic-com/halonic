import { Button, ExternalLink, Field, RadioGroup, type RadioOption } from "@halonicjs/studio-kit";
import { useEffect, useRef, useState } from "react";
import {
  type AgentChange,
  type AgentHarnessId,
  type AgentSettings,
  type AgentsHost,
  agentHarnessIds,
} from "../api.ts";
import { configurationWords as words } from "./configuration-words.ts";
import { type HarnessCheck, harnessSetupPages, harnessStrip } from "./harness-strip.ts";
import { HarnessStripCallout } from "./harness-strip-callout.tsx";
import { useHarnessCheck } from "./use-harness-check.ts";

/** Props for {@link HarnessPage}. */
export interface HarnessPageProps {
  readonly host: AgentsHost;
  readonly settings: AgentSettings;
  /** Saves one change; resolves to whether it was written. */
  readonly save: (change: AgentChange) => Promise<boolean>;
}

/** The line under a program's option, from what the check found; "Checking…" before the first answer. */
function programLine(id: Exclude<AgentHarnessId, "halonic">, found: HarnessCheck | undefined) {
  const program = words.harnessNames[id];
  const setup = harnessSetupPages[id];
  if (found === undefined) return <span className="text-fg-subtle">{words.checking}</span>;
  switch (found.status) {
    case "ready":
      return words.found(program, found.version);
    case "missing":
      return (
        <>
          <span className="text-warning">{words.notInstalled(program)}</span>{" "}
          <ExternalLink href={setup}>{words.howToInstall}</ExternalLink>
        </>
      );
    case "unsupported":
      return (
        <>
          <span className="text-warning">
            {words.tooOld(program, found.version, found.supported)}
          </span>{" "}
          <ExternalLink href={setup}>{words.howToUpdate}</ExternalLink>
        </>
      );
    case "signed-out":
      return <span className="text-fg-muted">{words.signedOut(program, found.version)}</span>;
    case "failed":
      return <span className="text-warning">{words.couldntAskVersion(program, found.error)}</span>;
    case "unreachable":
      return <span className="text-warning">{words.couldntCheck(program, found.error)}</span>;
  }
}

/**
 * The page has two Check again buttons, the strip's and the group's, and only one shows. A check
 * that shows or clears the strip takes away the one that was pressed, and focus with it, so focus
 * goes to the Check again that's now on the page (HF1 on HAL-13185). A check that leaves the
 * strip as it was, or one after focus moved elsewhere, leaves focus alone.
 */
function useFocusFollowsCheckAgain(
  check: () => Promise<void>,
  checking: boolean,
  stripShown: boolean,
) {
  const stripRegion = useRef<HTMLDivElement>(null);
  const groupCorner = useRef<HTMLDivElement>(null);
  const fromCheckAgain = useRef(false);
  const checkAgain = () => {
    fromCheckAgain.current = true;
    return check();
  };
  useEffect(() => {
    if (checking || !fromCheckAgain.current) return;
    fromCheckAgain.current = false;
    const focused = document.activeElement;
    if (focused !== null && focused !== document.body) return;
    const now = stripShown ? stripRegion.current : groupCorner.current;
    // The strip's Check again comes after its words and any Sign in for this agent, so it's last.
    const buttons = now?.querySelectorAll("button");
    buttons?.[buttons.length - 1]?.focus();
  }, [checking, stripShown]);
  return { stripRegion, groupCorner, checkAgain };
}

/**
 * The Harness page (`agents.configuration.harness`): which program the agent runs in, with what
 * the host found of each on this computer under its option, and one strip when the chosen one
 * can't run. The choice saves at once, and goes back to the saved one when the save fails.
 */
export function HarnessPage({ host, settings, save }: HarnessPageProps) {
  const [harness, setHarness] = useState(settings.harness);
  useEffect(() => setHarness(settings.harness), [settings.harness]);
  const { found, checking, check } = useHarnessCheck(host, settings.hubId, settings.id);

  const options: RadioOption<AgentHarnessId>[] = agentHarnessIds.map((id) => ({
    value: id,
    label: words.harnessNames[id],
    note: id === "halonic" ? words.builtIn : programLine(id, found[id]),
  }));
  const stripShown = harnessStrip(harness, found[harness]) !== null;
  const { stripRegion, groupCorner, checkAgain } = useFocusFollowsCheckAgain(
    check,
    checking,
    stripShown,
  );
  // Counts the picks, so a slow failed save doesn't undo a newer pick.
  const newestPick = useRef(0);
  const pick = async (next: AgentHarnessId) => {
    const mine = ++newestPick.current;
    setHarness(next);
    const saved = await save({ harness: next });
    // The file still names the old harness, so the page shows it again (D2 on HAL-12697).
    if (!saved && mine === newestPick.current) setHarness(settings.harness);
  };
  return (
    <div className="flex flex-col">
      {/* Always on the page, so a strip that appears after a change is read out (D5). */}
      <div ref={stripRegion} role="status" className={stripShown ? "mb-4" : undefined}>
        <HarnessStripCallout
          key={`${settings.hubId}/${settings.id}/${harness}`}
          host={host}
          agent={{ hubId: settings.hubId, id: settings.id }}
          name={settings.name}
          harness={harness}
          found={found[harness]}
          check={checkAgain}
        />
      </div>
      <div className="relative">
        {/* With a strip, the strip's Check again is the only one (H2 on HAL-13120). */}
        {!stripShown && (
          <div ref={groupCorner} className="absolute end-0 top-0">
            <Button
              variant="ghost"
              size="sm"
              busy={checking}
              busyLabel={words.checking}
              onClick={() => void checkAgain()}
            >
              {words.checkAgain}
            </Button>
          </div>
        )}
        <Field label={words.harness} hint={words.harnessHint}>
          <RadioGroup options={options} value={harness} onChange={(next) => void pick(next)} />
        </Field>
      </div>
    </div>
  );
}
