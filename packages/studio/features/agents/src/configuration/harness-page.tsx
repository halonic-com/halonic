import { Button, Callout, Field, RadioGroup, type RadioOption } from "@halonicjs/studio-kit";
import { useCallback, useEffect, useState } from "react";
import {
  type AgentChange,
  type AgentHarnessId,
  type AgentSettings,
  type AgentsHost,
  agentHarnessIds,
  type HarnessReadiness,
} from "../api.ts";
import { configurationWords as words } from "./configuration-words.ts";
import { harnessStrip } from "./harness-strip.ts";

/** Props for {@link HarnessPage}. */
export interface HarnessPageProps {
  readonly host: AgentsHost;
  readonly settings: AgentSettings;
  readonly save: (change: AgentChange) => Promise<void>;
}

type Readiness = Partial<Record<AgentHarnessId, HarnessReadiness>>;

/** The line under a harness option, from what the check found; `null` when nothing needs saying. */
function optionLine(id: AgentHarnessId, found: HarnessReadiness | undefined) {
  const program = words.harnessNames[id];
  if (found === undefined || found.status === "ready") return null;
  switch (found.status) {
    case "missing":
      return <span className="text-warning">{words.notInstalled(program)}</span>;
    case "unsupported":
      return (
        <span className="text-warning">
          {words.tooOld(program, found.version, found.supported)}
        </span>
      );
    case "signed-out":
      return <span className="text-fg-muted">{words.signedOut(program, found.version)}</span>;
    case "failed":
      return <span className="text-warning">{words.couldntCheck(program)}</span>;
  }
}

/**
 * The Harness page (`agents.configuration.harness`): which program the agent runs in, with what
 * the host found of each on this computer under its option, and one strip when the chosen one
 * can't run. The choice saves at once.
 */
export function HarnessPage({ host, settings, save }: HarnessPageProps) {
  const { hubId, id } = settings;
  const [harness, setHarness] = useState(settings.harness);
  useEffect(() => setHarness(settings.harness), [settings.harness]);
  const [found, setFound] = useState<Readiness>({});
  const [checking, setChecking] = useState(false);
  const check = useCallback(async () => {
    setChecking(true);
    const others = agentHarnessIds.filter((each) => each !== "halonic");
    const answers = await Promise.all(
      others.map((each) => host.harnessReadiness({ hubId, id }, each)),
    );
    setFound(Object.fromEntries(others.map((each, index) => [each, answers[index]])));
    setChecking(false);
  }, [host, hubId, id]);
  useEffect(() => void check(), [check]);

  const options: RadioOption<AgentHarnessId>[] = agentHarnessIds.map((id) => {
    const line = optionLine(id, found[id]);
    return {
      value: id,
      label: words.harnessNames[id],
      ...(line === null ? {} : { note: line }),
    };
  });
  const strip = harnessStrip(harness, found[harness]);
  const program = words.harnessNames[harness];
  const anyFailed = Object.values(found).some((one) => one.status === "failed");
  return (
    <div className="flex flex-col gap-4">
      {strip !== null && (
        <Callout
          tone="warning"
          action={{ label: words.checkAgain, busyLabel: words.checking, onClick: check }}
        >
          {strip === "not-installed"
            ? words.stripNotInstalled(settings.name, program)
            : words.stripTooOld(settings.name, program)}
        </Callout>
      )}
      <Field label={words.harness}>
        <RadioGroup
          options={options}
          value={harness}
          onChange={(next) => {
            setHarness(next);
            void save({ harness: next });
          }}
        />
      </Field>
      {strip === null && anyFailed && (
        <div>
          <Button variant="ghost" busy={checking} onClick={() => void check()}>
            {words.checkAgain}
          </Button>
        </div>
      )}
    </div>
  );
}
