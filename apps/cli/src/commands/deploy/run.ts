// `halonic deploy <deployment>` and `--plan`: deploys the workspace's last
// commit (deploy flow 2.6 to 2.11, 3.6 and 3.7), or shows what that would do.
// A thin command over the deploy app service: the service checks the lock,
// asks the questions and runs the target; this file takes the files and
// `deployments.yaml` from the commit, runs the gate (3.6), draws the steps
// and says how it ended.

import {
  chooseDeployment,
  type DeployInput,
  type DeployOutcome,
  deployReaches,
} from "@halonicjs/app";
import type { Connector, Deployment, Provider } from "@halonicjs/format";
import type {
  DeployEvent,
  DeploymentRef,
  DeployPlan,
  DeployStep,
  VcsCommit,
} from "@halonicjs/ports";
import { KindedError, systemClock } from "@halonicjs/std";
import { filesOf, type LoadedWorkspace, loadWorkspace, VersionSource } from "@halonicjs/workspace";
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
import { deployPlanMessages as words } from "../../messages/deploy-plan.ts";
import { duration } from "../../messages/duration.ts";
import { plainText } from "../../messages/phrase.ts";
import { deployFailure, selfTestFailedResult } from "../../output/deploy-failure.ts";
import { deployLiveLines, deployResult } from "../../output/deploy-output.ts";
import {
  cannotRunError,
  type DeploySummaryFacts,
  deployPlanResult,
  deploySummary,
} from "../../output/deploy-plan.ts";
import { deployStopped } from "../../output/deploy-stop.ts";
import { HistoryUnavailableError } from "../../run-workspace.ts";
import { halonicVersion } from "../../version.ts";
import { openWorkspaceDir } from "../../workspace-dir.ts";
import { workspaceNameOf } from "../../workspace-trust.ts";
import { openDeployHistory } from "./history.ts";

/** Thrown where nobody can answer `Deploy? [y/N]`, so the service lists every missing answer. */
class NobodyToAsk extends Error {
  override readonly name = "NobodyToAsk";
}

/**
 * Deploys the workspace's last commit to the named deployment, or to its one
 * Cloudflare deployment when none is named; with `--plan`, shows what that
 * would do and changes nothing.
 *
 * @throws UsageError with more than one name, none and no Cloudflare deployment (or no
 *   deployment at all), or `--exit-code` without `--plan`
 * @throws KindedError `invalid_input` when the workspace isn't in a git repository with a commit
 * @throws HistoryUnavailableError when git doesn't start or drops Halonic's git settings
 * @throws KindedError from the gate, and from the deploy app service through `deployFailure`
 */
export async function runDeploy(
  input: CommandInput,
  context: CommandContext,
  setup: DeploySetup,
): Promise<CommandResult | StoppedResult> {
  const planOnly = input.options["plan"] === true;
  const exitCodeAsked = input.options["exit-code"] === true;
  if (exitCodeAsked && !planOnly) throw new UsageError(words.exitCodeNeedsPlan());
  const [name, ...extra] = input.positionals;
  if (extra.length > 0) throw new UsageError(words.oneDeployment());
  const dir = await openWorkspaceDir(input, context);
  const here = workspaceNameOf(await loadWorkspace(dir.store), dir);
  // A git that drops Halonic's git settings, or doesn't start, says so and its fix (HAL-18200).
  const history = await (setup.openHistory ?? openDeployHistory)(dir.root).catch((error: unknown) =>
    Promise.reject(new HistoryUnavailableError(deployMessages.nothingChanged(), error)),
  );
  if (history === null) throw notARepository(here);
  try {
    const [head] = await history.vcs.log(1).catch(() => []);
    if (head === undefined) throw notARepository(here);
    const files = new VersionSource(history.vcs, head.hash, dir.store.location);
    // Everything the deploy uses comes from the commit, `deployments.yaml` too: an
    // uncommitted `stage`, account or Worker never decides where it goes.
    const committed = await loadWorkspace(files);
    const workspace = workspaceNameOf(committed, dir);
    const deployments = filesOf(committed, "deployments")[0]?.value.deployments ?? {};
    const chosen = chooseDeployment(workspace, deployments, name, committed.files);
    if (chosen.kind === "none") throw nothingChosen(workspace, deployments);
    const facts: DeployFacts = {
      id: chosen.id,
      deployment: chosen.deployment,
      workspace,
      committed,
      head,
      files,
      changed: (await history.vcs.status()).changes.length,
      yes: input.options["yes"] === true,
    };
    return planOnly
      ? await plan(context, setup, facts, exitCodeAsked)
      : await deploy(context, setup, facts);
  } finally {
    await history.close();
  }
}

interface DeployFacts {
  readonly id: string;
  readonly deployment: Deployment;
  readonly workspace: string;
  /** The workspace as the last commit has it: what the deploy and its questions use. */
  readonly committed: LoadedWorkspace;
  /** The last commit, whose files are deployed. */
  readonly head: VcsCommit;
  readonly files: VersionSource;
  /** Files with changes that aren't in `head`, untracked ones included. */
  readonly changed: number;
  readonly yes: boolean;
}

/** What a deploy and `--plan` share, once the gate has passed. */
interface Gated {
  readonly deploys: ReturnType<typeof deployServiceOf>;
  readonly ref: DeploymentRef;
  readonly summary: DeploySummaryFacts;
}

/**
 * Works out where the deployment lives, then the gate (3.6): uncommitted
 * changes, refused on production and named on development, then what can't
 * run on Cloudflare. Nothing has reached the host's deploy by then.
 */
async function gate(
  context: CommandContext,
  setup: DeploySetup,
  facts: DeployFacts,
): Promise<Gated> {
  const { id, deployment } = facts;
  const deploys = deployServiceOf(setup, deployment.cloudflare?.worker);
  const ref = await deploys
    .deploymentRef(deployment.host, id, deployment)
    .catch((error: unknown) => Promise.reject(deployFailure(error, id)));
  const commit = facts.head.hash.slice(0, 7);
  if (facts.changed > 0) {
    if (ref.environment === "production") {
      throw new KindedError("conflict", plainText(words.uncommitted(facts.changed).phrase), {
        fix: plainText(words.uncommittedFix().phrase),
      });
    }
    context.warn(words.uncommittedDevelopment(facts.changed, commit).phrase);
  }
  const reach = deployReaches(facts.committed);
  if (reach.kind === "cannot-run") throw cannotRunError(reach.problems, facts.workspace, id);
  return {
    deploys,
    ref,
    summary: {
      workspace: facts.workspace,
      deployment: id,
      commit,
      subject: facts.head.message.split("\n")[0] ?? "",
      reaches: reach.reaches,
      secretNames: reach.secretNames,
      routines: filesOf(facts.committed, "routine").length,
      inTheEu: deployment.cloudflare?.location === "eu",
    },
  };
}

/** `--plan` (2.11): the summary and every file, asking nothing and changing nothing. */
async function plan(
  context: CommandContext,
  setup: DeploySetup,
  facts: DeployFacts,
  exitCodeAsked: boolean,
): Promise<CommandResult> {
  const gated = await gate(context, setup, facts);
  const request = { ...requestOf(context, facts, gated, () => {}), questions: undefined };
  const { plan } = await gated.deploys
    .plan(request)
    .catch((error: unknown) => Promise.reject(deployFailure(error, facts.id)));
  return deployPlanResult(plan, {
    ...gated.summary,
    clock: {
      now: (setup.clock ?? systemClock).now(),
      ...(setup.timeZone === undefined ? {} : { timeZone: setup.timeZone }),
    },
    exitCode: exitCodeAsked,
  });
}

async function deploy(
  context: CommandContext,
  setup: DeploySetup,
  facts: DeployFacts,
): Promise<CommandResult | StoppedResult> {
  const { id } = facts;
  const clock = setup.clock ?? systemClock;
  const gated = await gate(context, setup, facts);
  const { deploys, summary } = gated;
  const lines = deployLiveLines(context);
  let plan: DeployPlan | undefined;
  // The heading of 2.8 and the gate's ✓ lines, printed ahead of the target's first step.
  const ahead = () => [
    words.deploying(facts.workspace, id).phrase,
    words.where("Cloudflare", plan?.account.name ?? "", summary.commit).phrase,
    [],
    words.checked(facts.workspace).phrase,
    words.took(plan?.files.length ?? 0, summary.commit).phrase,
  ];
  let heading: ReturnType<typeof ahead> = [];
  const steps = stepsSeen((event) => {
    if (heading.length === 0) {
      heading = ahead();
      for (const line of heading) context.printAhead(line);
    }
    lines.onEvent(event);
  });
  const started = clock.now().getTime();
  let outcome: DeployOutcome;
  try {
    const request = requestOf(context, facts, gated, (planned) => {
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
  const stepLines = [...heading, ...lines.lines];
  if (outcome.outcome === "self-test-failed") {
    return selfTestFailedResult(outcome, id, plan, stepLines);
  }
  return deployResult(outcome, {
    workspace: facts.workspace,
    deployment: id,
    took: duration(clock.now().getTime() - started),
    stepLines,
  });
}

/** What the deploy app service is given for this deploy. */
function requestOf(
  context: CommandContext,
  facts: DeployFacts,
  gated: Gated,
  onPlan: (plan: DeployPlan) => void,
): DeployInput {
  const { summary } = gated;
  return {
    host: facts.deployment.host,
    deployment: gated.ref,
    snapshot: { commit: facts.head.hash, files: facts.files, halonicVersion },
    reaches: summary.reaches,
    secretNames: summary.secretNames,
    secrets: new Map(),
    yes: facts.yes,
    questions: {
      secret: (secret) => askSecretValue(context, facts, secret),
      confirm: (plan) =>
        context.ask({
          question: deployMessages.question(),
          shownFirst: deploySummary(plan, summary),
          yes: false,
          refusal: () => new NobodyToAsk(),
        }),
    },
    signal: context.signal,
    onPlan,
  };
}

/** 2.6: what needs the secret, then the paste prompt. */
async function askSecretValue(
  context: CommandContext,
  facts: DeployFacts,
  secret: string,
): Promise<string> {
  const owner = secretOwner(facts.committed, secret);
  const value = await context.askSecret(words.secretPrompt(secret), () => new NobodyToAsk(), [
    words.secretNeeded(facts.workspace, owner, secret).phrase,
    words.secretPaste().phrase,
  ]);
  if (value === undefined) throw new NobodyToAsk();
  return value;
}

/** "provider anthropic" or "connector crm": the first file that names the secret. */
function secretOwner(workspace: LoadedWorkspace, secret: string): string {
  const named = (item: Provider | Connector) => item.secret === secret;
  const provider = filesOf(workspace, "provider").find((file) => named(file.value));
  if (provider !== undefined) return `provider ${provider.value.id}`;
  const connector = filesOf(workspace, "connector").find((file) => named(file.value));
  return connector === undefined ? "workspace" : `connector ${connector.value.id}`;
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

/** Why no deployment was picked: the workspace has none yet, or the user has to name one. */
function nothingChosen(workspace: string, deployments: Record<string, Deployment>): UsageError {
  if (Object.keys(deployments).length > 0) return new UsageError(deployMessages.needsName());
  return new UsageError(deployMessages.noDeployments(workspace), deployMessages.noDeploymentsFix());
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
