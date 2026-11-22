import {
  Callout,
  Dialog,
  Field,
  inlineLinkClasses,
  RadioGroup,
  type RadioOption,
} from "@halonicjs/studio-kit";
import { errorReasonFor } from "@halonicjs/studio-shell";
import { useId, useState } from "react";
import type { AgentPlacementState, AgentSettings, AgentsHost } from "../api.ts";
import { configurationWords } from "./configuration-words.ts";
import { usePlacement } from "./use-placement.ts";

const words = configurationWords.whereItRuns;

/** The two choices of Where it runs. */
type RunsOn = "sandbox" | "this-computer";

/** Props for {@link WhereItRuns}. */
export interface WhereItRunsProps {
  readonly host: AgentsHost;
  readonly settings: AgentSettings;
}

/**
 * The warning while it is open: the fingerprint of the file it warns about, and why the last
 * confirm didn't save, if it didn't.
 */
interface Warning {
  readonly fingerprint: string;
  readonly error?: string;
}

/** The choice the page shows: a choice on hold stays On this computer, held, not dropped (3.8). */
function shownChoice(placement: AgentPlacementState): RunsOn {
  return placement.runsOn === "sandbox" ? "sandbox" : "this-computer";
}

/**
 * The line under On this computer's note, if any: on hold, that it is (HAL-15640); otherwise,
 * while this Studio can't start an agent outside its sandbox, where such an agent does run, as its
 * host reports it (HAL-13194).
 */
function thisComputerHint(placement: AgentPlacementState): string | null {
  if (placement.runsOn === "on-hold") return words.onHoldNote;
  return placement.studioStartsUnfenced ? null : words.studioCantStart;
}

/** The two options. */
function optionsFor(placement: AgentPlacementState): RadioOption<RunsOn>[] {
  const hint = thisComputerHint(placement);
  const thisComputerNote =
    hint === null ? (
      words.onThisComputerNote
    ) : (
      <>
        {words.onThisComputerNote}
        <span className="block">{hint}</span>
      </>
    );
  return [
    { value: "sandbox", label: words.inSandbox, note: words.inSandboxNote },
    { value: "this-computer", label: words.onThisComputer, note: thisComputerNote },
  ];
}

/**
 * Harness › Where it runs (`agents.configuration.where-it-runs`; checklist 3.8). The sandbox
 * saves at once. On this computer saves only after the warning, for the file the person was
 * warned about: Cancel is focused and **Run on this computer** is the danger button. When the
 * agent's file changed since, the choice is on hold: On this computer says so, and a Callout under
 * it with **Review and confirm** opens the same warning. While the agent's file has unsaved
 * changes, the warning says to confirm once they're saved: the choice is for the saved file, which
 * may hold what they already took out. Where Studio can't choose (the browser), only a line
 * pointing to the desktop app is drawn.
 */
export function WhereItRuns({ host, settings }: WhereItRunsProps) {
  const ref = { hubId: settings.hubId, id: settings.id };
  const { load, reload, openChanges } = usePlacement(host, settings.hubId, settings.id);
  const [warning, setWarning] = useState<Warning | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveFirstId = useId();

  if (load.kind === "loading") return null;
  if (load.kind === "unavailable") {
    return <p className="text-caption text-fg-subtle">{words.desktopOnly}</p>;
  }
  if (load.kind === "failed") {
    return (
      <Field label={words.label}>
        <Callout tone="warning" action={{ label: configurationWords.tryAgain, onClick: reload }}>
          {words.couldntRead(load.reason)}
        </Callout>
      </Field>
    );
  }
  const { placement } = load;
  const saveFirst = placement.unsaved ? { unavailable: { reason: saveFirstId } } : {};

  const pick = async (next: RunsOn) => {
    setError(null);
    if (next === shownChoice(placement)) return;
    if (next === "this-computer") {
      setWarning({ fingerprint: placement.fingerprint });
      return;
    }
    try {
      await host.chooseSandbox(ref);
    } catch (thrown) {
      setError(words.notSaved(errorReasonFor(thrown)));
    }
    await reload();
  };

  const confirm = async (shown: Warning) => {
    setBusy(true);
    try {
      const chosen = await host.chooseThisComputer(ref, shown.fingerprint);
      if (chosen.saved) {
        setWarning(null);
        await reload();
      } else {
        // The file changed while the person read: warn again, about the file as it is now.
        setWarning({
          fingerprint: chosen.fingerprint,
          error: words.changedWhileOpen(settings.name),
        });
      }
    } catch (thrown) {
      setWarning({ ...shown, error: words.notSaved(errorReasonFor(thrown)) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Field label={words.label} error={error}>
        <div className="flex flex-col gap-3">
          <RadioGroup
            options={optionsFor(placement)}
            value={shownChoice(placement)}
            onChange={(next) => void pick(next)}
          />
          {/* Attention, not warning: both Callouts ask the person to act before the agent runs (C569). */}
          {placement.runsOn === "on-hold" && (
            <Callout
              tone="attention"
              action={{
                label: words.reviewAndConfirm,
                onClick: () => setWarning({ fingerprint: placement.fingerprint }),
              }}
            >
              {words.onHold(settings.name)}
            </Callout>
          )}
        </div>
      </Field>
      {warning !== null && (
        <Dialog
          title={words.warningTitle(settings.name)}
          confirm={{
            label: words.confirm,
            variant: "danger",
            busyLabel: words.saving,
            ...saveFirst,
          }}
          cancelLabel={words.cancel}
          busy={busy}
          {...(warning.error === undefined ? {} : { error: warning.error })}
          onConfirm={() => void confirm(warning)}
          onCancel={() => setWarning(null)}
        >
          {placement.runsOn === "on-hold" && (
            <FileChangedLine
              agent={settings.name}
              changedAt={placement.changedAt}
              openChanges={
                openChanges &&
                (() => {
                  setWarning(null);
                  openChanges();
                })
              }
            />
          )}
          <p>{words.warningAccess(settings.name)}</p>
          <p>{words.warningTrust(settings.name)}</p>
          {placement.unsaved && (
            <Callout tone="attention">
              <span id={saveFirstId}>{words.saveFirst(settings.name)}</span>
            </Callout>
          )}
        </Dialog>
      )}
    </>
  );
}

/**
 * The warning's first line while the choice is on hold: the agent's file changed, on the day the
 * host says when it can tell, then **See what changed ›**, which closes the warning and opens
 * Changes. The link never wraps on its own (checklist 3.8).
 */
function FileChangedLine({
  agent,
  changedAt,
  openChanges,
}: {
  readonly agent: string;
  readonly changedAt: string | undefined;
  readonly openChanges: (() => void) | undefined;
}) {
  return (
    <p>
      {changedAt === undefined ? words.fileChanged(agent) : words.fileChangedOn(agent, changedAt)}
      {openChanges && (
        <>
          {" "}
          <button
            type="button"
            className={`${inlineLinkClasses} whitespace-nowrap`}
            onClick={openChanges}
          >
            {words.seeWhatChanged}
          </button>
        </>
      )}
    </p>
  );
}
