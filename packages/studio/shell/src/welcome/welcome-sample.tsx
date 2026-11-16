import { Button } from "@halonicjs/studio-kit";

/** Why the Acme sample couldn't be created: the folder it goes in, as the user knows it, and the reason. */
export interface WelcomeSampleProblem {
  /** The parent folder, such as `~/Documents`. */
  readonly folder: string;
  /** Why nothing was written, such as "permission denied". */
  readonly reason: string;
}

/** The sample action and its cost line (microcopy 5, flow-first-run 2.1). */
export const trySampleWords = {
  action: "Try the Acme sample",
  creating: "Creating the sample…",
  cost: "Runs on the built-in test model, with scripted replies. No key, no cost.",
} as const;

/** The sentence under Welcome's text when the sample couldn't be created, with a closing full stop. */
export function cantCreateSampleLine(problem: WelcomeSampleProblem): string {
  const reason = problem.reason.endsWith(".") ? problem.reason : `${problem.reason}.`;
  return `Can't create the sample in ${problem.folder}: ${reason}`;
}

/** Props for {@link TrySample}. */
export interface TrySampleProps {
  /** True once Recent has entries: the action is then a quiet link without the cost line. */
  readonly quiet: boolean;
  /** True while the sample is being written. */
  readonly busy: boolean;
  readonly onPress: () => void;
}

/**
 * **Try the Acme sample** on the Welcome screen (`shell.welcome.try-sample`). While Recent is
 * empty it is a secondary button with the cost line under it; once Recent has entries it is a
 * ghost button under the list, without the cost line. While busy it reads "Creating the sample…",
 * keeps focus and ignores presses.
 *
 * @example
 * <TrySample quiet={false} busy={false} onPress={createSample} />
 */
export function TrySample({ quiet, busy, onPress }: TrySampleProps) {
  return (
    <div className="flex flex-col items-center gap-1">
      <Button
        variant={quiet ? "ghost" : "secondary"}
        busy={busy}
        busyLabel={trySampleWords.creating}
        onClick={onPress}
      >
        {trySampleWords.action}
      </Button>
      {quiet ? null : <p className="text-small text-fg-muted">{trySampleWords.cost}</p>}
    </div>
  );
}
