// What `halonic deploy` shows while it deploys and when it's live (deploy
// flow, revision 5, 2.8 to 2.10, and 4 for `--json`). Each step's live ◌
// line is replaced by its ✓ line, printed ahead; the result repeats those
// lines word for word (requirement `cli.print-ahead`), then the live line.
// Every warning the target gives is shown: as a `!` line on stderr, and in
// `--json` as an event or in the result's `warnings` (HAL-9255).

import type {
  DeployDone,
  DeployEvent,
  DeployResource,
  DeployStep,
  DeployUnchanged,
} from "@halonicjs/ports";
import type { CommandContext, CommandResult } from "../command.ts";
import { exitCode } from "../exit-code.ts";
import type { Message } from "../messages/define.ts";
import { deployMessages } from "../messages/deploy.ts";
import { type Phrase, plainText } from "../messages/phrase.ts";
import type { Progress } from "./progress.ts";

/** Draws a deploy as its events come; see {@link deployLiveLines}. */
export interface DeployLiveLines {
  /** Pass it as the deploy's `onEvent`. */
  onEvent(event: DeployEvent): void;
  /** Takes the live line away and prints what's still held, when the deploy has ended for any reason. */
  end(): void;
  /** The ✓ lines printed so far, for the result to repeat. */
  readonly lines: readonly Phrase[];
}

/**
 * Prints a deploy's finished steps ahead and draws the running step's live
 * line. The things a deploy creates come one event each but share one ✓ line
 * ("Created the Worker acme, the D1 database acme-data and …"), so they're
 * held until the next step starts. The switch has no ✓ line: the result's
 * "is live" line says it. With `--json`, every event is a line of its own.
 */
export function deployLiveLines(
  context: Pick<CommandContext, "progress" | "printAhead" | "warn" | "printJsonLine">,
): DeployLiveLines {
  const lines: Phrase[] = [];
  let created: DeployResource[] = [];
  let progress: Progress | undefined;

  const finish = (line: Message | undefined) => {
    progress?.end();
    progress = undefined;
    if (line !== undefined) {
      lines.push(line.phrase);
      context.printAhead(line.phrase);
    }
  };
  const flushCreated = () => {
    if (created.length > 0) finish(deployMessages.created(resourceList(created)));
    created = [];
  };

  return {
    lines,
    onEvent(event) {
      context.printJsonLine({ event });
      if (event.phase === "warning") {
        context.warn(deployMessages.warning(event.message).phrase);
      } else if (event.phase === "waiting") {
        progress?.waitingFor("Cloudflare");
      } else if (event.phase === "started") {
        if (event.step !== "create") flushCreated();
        progress?.end();
        progress = context.progress(doing(event).phrase);
      } else if (event.step === "create") {
        progress?.end();
        progress = undefined;
        created.push(event.resource);
      } else {
        finish(done(event));
      }
    },
    end() {
      flushCreated();
      finish(undefined);
    },
  };
}

/** What a deploy that went live, or changed nothing, says; see {@link deployResult}. */
export interface DeployResultFacts {
  /** The workspace's name, such as "Acme". */
  readonly workspace: string;
  /** The deployment's name, such as "web". */
  readonly deployment: string;
  /** How long it took, as `duration` writes it, such as "1 min 12 s". */
  readonly took: string;
  /** The ✓ lines printed ahead, from {@link DeployLiveLines.lines}. */
  readonly stepLines: readonly Phrase[];
}

/**
 * The result of a deploy that went live or changed nothing. Every entry of
 * `DeployDone.warnings` is a `!` line on stderr and is in `--json`'s
 * `warnings`, none dropped: the deploy is live, but the user must see what
 * went wrong after the switch, such as the lock lost to another deploy.
 */
export function deployResult(
  outcome: DeployDone | DeployUnchanged,
  facts: DeployResultFacts,
): CommandResult {
  const { version } = outcome;
  const json = {
    deployment: facts.deployment,
    url: outcome.url,
    version: version.number,
    commit: version.commit,
    halonicVersion: version.halonicVersion,
    unchanged: outcome.outcome === "unchanged",
  };
  if (outcome.outcome === "unchanged") {
    const line = deployMessages.unchanged(
      facts.deployment,
      version.commit ?? "",
      version.halonicVersion ?? "",
    );
    return { exitCode: exitCode.ok, lines: [line.phrase], json: { ...json, warnings: [] } };
  }
  return {
    exitCode: exitCode.ok,
    lines: [
      ...facts.stepLines,
      deployMessages.live(facts.workspace, facts.deployment, outcome.url).phrase,
      deployedLine(outcome, facts),
    ],
    json: { ...json, warnings: outcome.warnings },
    warnings: outcome.warnings.map((warning) => deployMessages.warning(warning).phrase),
  };
}

function deployedLine(outcome: DeployDone, facts: DeployResultFacts): Phrase {
  const { version, previous } = outcome;
  const commit = version.commit ?? "";
  const was = previous?.halonicVersion;
  const deployed =
    was !== undefined && version.halonicVersion !== undefined && was !== version.halonicVersion
      ? deployMessages.deployedWithHalonicAs(
          commit,
          version.halonicVersion,
          was,
          version.number,
          facts.took,
        )
      : deployMessages.deployedAs(commit, version.number, facts.took);
  return previous === undefined
    ? deployed.phrase
    : [...deployed.phrase, ...deployMessages.kept(previous.number, facts.deployment).phrase];
}

function doing(event: DeployStep): Message {
  switch (event.step) {
    case "create":
      return deployMessages.creating(resourceList([event.resource]));
    case "database":
      return deployMessages.updatingDatabase();
    case "upload":
      return deployMessages.uploading(event.version, event.files);
    case "self-test":
      return deployMessages.selfTesting(event.version);
    case "switch":
      return deployMessages.switching(event.version);
  }
}

function done(event: Exclude<DeployStep, { step: "create" }>): Message | undefined {
  switch (event.step) {
    case "database":
      return event.first
        ? deployMessages.databaseSetUp()
        : deployMessages.databaseUpdated(event.changes);
    case "upload":
      return deployMessages.uploaded(event.version, event.secrets);
    case "self-test":
      return deployMessages.selfTestPassed(event.version);
    case "switch":
      return undefined;
  }
}

/** "the Worker acme", "the Worker acme and the D1 database acme-data", "a, b and c". */
function resourceList(resources: readonly DeployResource[]): string {
  const names = resources.map((resource) =>
    plainText(deployMessages[resource.kind](resource.name).phrase),
  );
  return names.length <= 1
    ? names.join("")
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
