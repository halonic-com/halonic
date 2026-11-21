import type {
  Clock,
  DeployEvent,
  DeployLockHolder,
  DeploymentRef,
  DeployPlan,
  DeployReach,
  DeployRequest,
  DeployResult,
  DeploySnapshot,
  DeployTarget,
} from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import { type DeployNews, deployNews, hasNews } from "./deploy-news.ts";

/** The questions a deploy may ask. Only given when there's a terminal to ask them in. */
export interface DeployQuestions {
  /** Asks for a secret's value. */
  secret(name: string): Promise<string>;
  /** Shows the summary with what's new and asks `Deploy? [y/N]`. */
  confirm(plan: DeployPlan, news: DeployNews): Promise<boolean>;
}

/** What the deploy app service needs. It gets a target only through `loadTarget`. */
export interface DeployServiceDeps {
  /** Loads the target for a `deployments.yaml` host, such as "cloudflare". */
  readonly loadTarget: (host: string) => Promise<DeployTarget>;
  readonly clock: Clock;
  /** The time zone for "run again after 14:42"; the machine's own when left out. */
  readonly timeZone?: string;
}

/** One `halonic deploy <deployment>`. */
export interface DeployInput {
  readonly host: string;
  readonly deployment: DeploymentRef;
  readonly snapshot: DeploySnapshot;
  readonly reaches: readonly DeployReach[];
  /** The secrets the workspace needs, by name. */
  readonly secretNames: readonly string[];
  /** The values already given, such as on `--secrets-stdin`. */
  readonly secrets: ReadonlyMap<string, string>;
  /** `--yes`: answers `Deploy? [y/N]`, and nothing else. */
  readonly yes: boolean;
  /** `undefined` without a terminal: then nothing is asked. */
  readonly questions: DeployQuestions | undefined;
  readonly signal?: AbortSignal;
}

/** How a deploy ended: the target's result, or `declined` when the user said no. */
export type DeployOutcome = DeployResult | { readonly outcome: "declined" };

/**
 * The rules of `halonic deploy` between the command and the target (deploy
 * flow, revision 4; requirement `app.deploy-service`), so the command stays
 * thin. In order: the lock is checked before any question (3.7); without a
 * terminal every missing answer is listed in one error (4); `Deploy? [y/N]`
 * is asked only when something is new against what's live (C4); and the
 * workspace doesn't have to be trusted, so nothing here asks for trust (C1).
 *
 * @example
 * const deploys = createDeployService({ loadTarget, clock });
 * const outcome = await deploys.deploy(input, (event) => output.show(event));
 */
export function createDeployService(deps: DeployServiceDeps) {
  return {
    async deploy(
      input: DeployInput,
      onEvent: (event: DeployEvent) => void,
    ): Promise<DeployOutcome> {
      const target = await deps.loadTarget(input.host);
      const request = requestOf(input);
      const plan = await target.plan(request);
      if (plan.lockedBy !== undefined) {
        throw lockedError(input.deployment.name, plan.lockedBy, deps);
      }
      const news = deployNews(plan, input.reaches);
      const ask = hasNews(news) && !input.yes;
      const missing = input.secretNames.filter((name) => !input.secrets.has(name));
      const { questions } = input;
      if (questions === undefined) {
        if (ask || missing.length > 0)
          throw missingAnswersError(input.deployment.name, ask, missing);
        return target.deploy(request, onEvent);
      }
      const secrets = new Map(input.secrets);
      for (const name of missing) secrets.set(name, await questions.secret(name));
      if (ask && !(await questions.confirm(plan, news))) return { outcome: "declined" };
      return target.deploy({ ...request, secrets }, onEvent);
    },
  };
}

/** The deploy app service. */
export type DeployService = ReturnType<typeof createDeployService>;

function requestOf(input: DeployInput): DeployRequest {
  return {
    deployment: input.deployment,
    snapshot: input.snapshot,
    reaches: input.reaches,
    secrets: input.secrets,
    ...(input.signal === undefined ? {} : { signal: input.signal }),
  };
}

function lockedError(name: string, holder: DeployLockHolder, deps: DeployServiceDeps): KindedError {
  const now = deps.clock.now().getTime();
  const minutes = Math.max(0, Math.round((now - Date.parse(holder.startedAt)) / 60_000));
  const started = minutes === 0 ? "less than a minute ago" : `${minutes} min ago`;
  const until = new Date(holder.expiresAt).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    ...(deps.timeZone === undefined ? {} : { timeZone: deps.timeZone }),
  });
  return new KindedError(
    "conflict",
    `Couldn't deploy ${name}: a deploy of ${name} by ${holder.who} is still running, started ${started}. Nothing changed on Cloudflare.`,
    {
      fix: `Wait for it to finish, then run again. If it was stopped without finishing, run again after ${until}, when its lock runs out.`,
    },
  );
}

function missingAnswersError(name: string, ask: boolean, secrets: readonly string[]): KindedError {
  const count = (ask ? 1 : 0) + secrets.length;
  const parts = [
    ...(ask ? ["--yes for the deploy question"] : []),
    ...(secrets.length > 0 ? [`${joinWords(secrets)} on --secrets-stdin`] : []),
  ];
  const answers = count === 1 ? "1 answer is" : `${count} answers are`;
  return new KindedError(
    "invalid_input",
    `Couldn't deploy ${name}: ${answers} missing, and there's no terminal to ask you. Nothing changed on Cloudflare.`,
    { fix: `Pass ${count === 1 ? "it" : "them"}: ${parts.join(", and ")}.` },
  );
}

/** "a", "a and b", "a, b and c". */
function joinWords(words: readonly string[]): string {
  return words.length <= 1
    ? words.join("")
    : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}
