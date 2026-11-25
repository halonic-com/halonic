// `halonic deploy <deployment>`: deploys the workspace's last commit (deploy
// flow 2.7 to 2.10, 3.6 and 3.7). A thin command over the deploy app
// service's `deploy`: the service checks the lock, asks `Deploy? [y/N]` when
// something is new and runs the target; this file takes the files from the
// commit, draws the steps and says how it ended.

import { chooseDeployment, type DeployInput, type DeployOutcome } from "@halonicjs/app";
import type { Deployment } from "@halonicjs/format";
import type {
  DeployEvent,
  DeploymentRef,
  DeployPlan,
  DeployStep,
  VcsCommit,
} from "@halonicjs/ports";
import { KindedError, systemClock } from "@halonicjs/std";
import { filesOf, loadWorkspace, VersionSource } from "@halonicjs/workspace";
import {
  type CommandContext,
  type CommandInput,
  type CommandResult,
  type StoppedResult,
  UsageError,
} from "../../command.ts";
import { type DeploySetup, deployServiceOf } from "../../deploy-host.ts";
import { exitCode } from "../../exit-code.ts";
import { deployMessages } from "../../messages/deploy.ts";
import { duration } from "../../messages/duration.ts";
import { plainText } from "../../messages/phrase.ts";
import { deployFailure, selfTestFailedResult } from "../../output/deploy-failure.ts";
import { deployLiveLines, deployResult, resourceList } from "../../output/deploy-output.ts";
import { deployStopped } from "../../output/deploy-stop.ts";
import { openGitHistory } from "../../run-workspace.ts";
import { halonicVersion } from "../../version.ts";
import { openWorkspaceDir } from "../../workspace-dir.ts";
import { workspaceNameOf } from "../../workspace-trust.ts";

/** Thrown where nobody can answer `Deploy? [y/N]`, so the service lists every missing answer. */
class NobodyToAsk extends Error {
  override readonly name = "NobodyToAsk";
}

/**
 * Deploys the workspace's last commit to the named deployment, or to its one
 * Cloudflare deployment when none is named.
 *
 * @throws UsageError with more than one name, or none and no Cloudflare deployment
 * @throws KindedError `invalid_input` when the workspace isn't in a git repository with a commit
 * @throws KindedError from the deploy app service, through `deployFailure`
 */
export async function runDeploy(
  input: CommandInput,
  context: CommandContext,
  setup: DeploySetup,
): Promise<CommandResult | StoppedResult> {
  const [name, ...extra] = input.positionals;
  if (extra.length > 0) throw new UsageError(deployMessages.needsName());
  const dir = await openWorkspaceDir(input, context);
  const workspace = await loadWorkspace(dir.store);
  const workspaceName = workspaceNameOf(workspace, dir);
  const deployments = filesOf(workspace, "deployments")[0]?.value.deployments ?? {};
  const chosen = chooseDeployment(workspaceName, deployments, name, workspace.files);
  if (chosen.kind === "none") throw new UsageError(deployMessages.needsName());
  const history = await (setup.openHistory ?? openGitHistory)(dir.root);
  if (history === null) throw notARepository(workspaceName);
  try {
    const [head] = await history.vcs.log(1).catch(() => []);
    if (head === undefined) throw notARepository(workspaceName);
    return await deploy(context, setup, {
      id: chosen.id,
      deployment: chosen.deployment,
      workspace: workspaceName,
      head,
      files: new VersionSource(history.vcs, head.hash, dir.store.location),
      yes: input.options["yes"] === true,
    });
  } finally {
    await history.close();
  }
}

interface DeployFacts {
  readonly id: string;
  readonly deployment: Deployment;
  readonly workspace: string;
  /** The last commit, whose files are deployed. */
  readonly head: VcsCommit;
  readonly files: VersionSource;
  readonly yes: boolean;
}

async function deploy(
  context: CommandContext,
  setup: DeploySetup,
  facts: DeployFacts,
): Promise<CommandResult | StoppedResult> {
  const { id, deployment } = facts;
  const clock = setup.clock ?? systemClock;
  const deploys = deployServiceOf(setup, deployment.cloudflare?.worker);
  const lines = deployLiveLines(context);
  const steps = stepsSeen(lines.onEvent);
  let plan: DeployPlan | undefined;
  const started = clock.now().getTime();
  let outcome: DeployOutcome;
  try {
    const ref = await deploys.deploymentRef(deployment.host, id, deployment);
    const request = requestOf(context, facts, ref, (planned) => {
      plan = planned;
    });
    outcome = await deploys.deploy(request, steps.onEvent).catch((error: unknown) => {
      if (!(error instanceof NobodyToAsk)) throw error;
      // No terminal: the service lists every missing answer in one error (flow 4). The plan
      // changes nothing, so reading it again costs only the time.
      return deploys.deploy({ ...request, questions: undefined }, steps.onEvent);
    });
  } catch (error) {
    lines.end();
    const stop = context.signal.aborted
      ? deployStopped(error, {
          deployment: id,
          running: steps.running(),
          changed: steps.changed(),
          databaseChanges: plan?.databaseChanges.length,
        })
      : undefined;
    if (stop !== undefined) return stop;
    throw deployFailure(error, id);
  }
  lines.end();
  if (outcome.outcome === "declined") {
    return {
      exitCode: exitCode.failed,
      lines: [deployMessages.nothingChanged().phrase],
      json: { deployment: id, deployed: false },
    };
  }
  if (outcome.outcome === "self-test-failed") {
    return selfTestFailedResult(outcome, id, plan, lines.lines);
  }
  return deployResult(outcome, {
    workspace: facts.workspace,
    deployment: id,
    took: duration(clock.now().getTime() - started),
    stepLines: lines.lines,
  });
}

/** What the deploy app service is given for this deploy. */
function requestOf(
  context: CommandContext,
  facts: DeployFacts,
  deployment: DeploymentRef,
  onPlan: (plan: DeployPlan) => void,
): DeployInput {
  return {
    host: facts.deployment.host,
    deployment,
    snapshot: { commit: facts.head.hash, files: facts.files, halonicVersion },
    // What the workspace reaches and the secrets it needs come with the summary's
    // Reaches and Secrets rows; until then nothing is sent (HAL-18019's follow-ups).
    reaches: [],
    secretNames: [],
    secrets: new Map(),
    yes: facts.yes,
    questions: {
      // With `secretNames` empty the service asks for no secret, so this is never called.
      secret: (secretName) => Promise.reject(new RangeError(secretName)),
      confirm: (plan) => confirm(context, facts, plan),
    },
    signal: context.signal,
    onPlan,
  };
}

/** Passes each event on and keeps the step that's running and whether any finished, for a stop. */
function stepsSeen(onEvent: (event: DeployEvent) => void) {
  let running: DeployStep | undefined;
  let changed = false;
  return {
    onEvent(event: DeployEvent) {
      if (event.phase === "started") running = event;
      if (event.phase === "done") {
        running = undefined;
        changed = true;
      }
      onEvent(event);
    },
    running: () => running,
    changed: () => changed,
  };
}

/** The summary and `Deploy? [y/N]` (2.7), with the rows this deploy can fill. */
function confirm(context: CommandContext, facts: DeployFacts, plan: DeployPlan): Promise<boolean> {
  const { head } = facts;
  const commit = head.hash.slice(0, 7);
  const rows = [
    deployMessages.summary(facts.workspace, "Cloudflare").phrase,
    deployMessages.accountRow(plan.account.name).phrase,
    ...(plan.url === undefined ? [] : [deployMessages.addressRow(plan.url).phrase]),
    deployMessages.filesRow(plan.files.length, commit, head.message).phrase,
    ...(plan.creates.length === 0
      ? []
      : [deployMessages.createsRow(resourceList(plan.creates)).phrase]),
  ];
  return context.ask({
    question: deployMessages.question(),
    shownFirst: rows,
    yes: false,
    refusal: () => new NobodyToAsk(),
  });
}

/** "Acme isn't in a git repository, and a deploy takes its files from a commit." Exit 2. */
function notARepository(workspace: string): KindedError {
  return new KindedError(
    "invalid_input",
    plainText(deployMessages.notARepository(workspace).phrase),
    {
      fix: plainText(deployMessages.notARepositoryFix().phrase),
    },
  );
}
