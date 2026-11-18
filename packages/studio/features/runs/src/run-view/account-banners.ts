// The failed banners about the provider's account and the workspace's rules (UX check R1 to R6 on
// HAL-12390, microcopy 15.3): no key, a refused key, a busy provider, no credit, a cloud model the
// provider doesn't have, and a local-only workspace. They read the same facts as the CLI's failure
// lines (`@halonicjs/app/run-failure`), so the two can't drift apart (E4); Studio swaps the CLI's
// file or variable fix for a button.

import {
  type FailedModel,
  failedModelOf,
  type RunFailure,
  runFailureOf,
} from "@halonicjs/app/run-failure";
import type { RunEvent } from "@halonicjs/events";
import { failureWords } from "../failure-words.ts";
import { providerNameOf } from "../provider-name.ts";
import { billingPageOf } from "./billing-pages.ts";
import { danger } from "./danger-banner.ts";
import type { BannerFix, RunBanner, RunPageContext } from "./run-page-model.ts";

/** The failure's facts, and the model the run called last, which names its provider. */
interface AccountFailure {
  readonly failure: RunFailure;
  readonly model: FailedModel;
}

/**
 * The banner for a run that failed with `key-refused`, `provider-busy`, `out-of-credit`,
 * `local-only`, or `model-missing` at a cloud provider; `undefined` while the log or the
 * workspace's models aren't read, or when the facts are missing (such as a provider without a
 * secret), so the page keeps its general banner.
 *
 * @param phone Whether the page is a phone's, where Models can't be opened, so the fix becomes a
 *   line saying to do it on the computer (microcopy 15.3).
 */
export function accountBanner(
  log: readonly RunEvent[] | undefined,
  context: RunPageContext,
  step: string,
  phone: boolean,
): RunBanner | undefined {
  const facts = accountFailureOf(log, context);
  if (facts === undefined) {
    return undefined;
  }
  const { failure, model } = facts;
  const provider = providerNameOf(model.providerId, context.providerName);
  switch (failure.reason) {
    case "no-key":
      return withModelsFix(failureWords.noKey(provider, failure.alias), { label: failureWords.addKey }, phone);
    case "key-refused":
      return withModelsFix(
        failureWords.keyRefused(provider, failure.secret, failure.alias),
        { label: failureWords.replaceKey },
        phone,
      );
    case "provider-busy":
      return danger([busyLine(provider, step, failure.retried)]);
    case "out-of-credit":
      return outOfCredit(provider, model.provider);
    case "model-missing":
      // A local provider's banner says how to download it; this one is for a cloud provider only.
      return context.providerKind(model.providerId) === "cloud"
        ? withModelsFix(
            cloudModelMissing(provider, failure.model, failure.alias),
            aliasTab(failure.alias),
            phone,
          )
        : undefined;
    case "local-only": {
      const agent = context.agentName?.(failure.agent) ?? failure.agent;
      const line = failureWords.localOnly(failure.workspace, provider, agent, failure.alias);
      return phone
        ? danger([line, failureWords.fixOnComputer(failureWords.modelsPlace)], { noRunAgain: true })
        : danger([line], {
            fixes: [openModels({ label: failureWords.chooseLocalModel(agent) })],
            noRunAgain: true,
          });
    }
    default:
      return undefined;
  }
}

/** The shared facts of the run's `run.failed`, with the model it called last. */
function accountFailureOf(
  log: readonly RunEvent[] | undefined,
  context: RunPageContext,
): AccountFailure | undefined {
  const failed = log?.findLast((event) => event.type === "run.failed");
  if (log === undefined || failed === undefined || context.models === undefined) {
    return undefined;
  }
  const model = failedModelOf(log, context.models);
  const failure = runFailureOf(failed, model);
  return model === undefined || failure === undefined ? undefined : { failure, model };
}

/** A line whose fix is in Models: a button there, or on a phone a line saying to do it on the computer. */
function withModelsFix(line: string, models: ModelsTarget, phone: boolean): RunBanner {
  return phone
    ? danger([line, failureWords.fixOnComputer(failureWords.modelsPlace)])
    : danger([line], { fixes: [openModels(models)] });
}

/** R5's **Open Models** at the alias's tab (15.3); none when the facts name no alias. */
function aliasTab(alias: string): ModelsTarget {
  return isAlias(alias) ? { alias } : {};
}

/** R5, naming the alias unless no alias points at the model: the facts then name it `<provider>/<model>`. */
function cloudModelMissing(provider: string, model: string, alias: string): string {
  return isAlias(alias)
    ? failureWords.cloudModelMissing(provider, model, alias)
    : failureWords.cloudModelMissingNoAlias(provider, model);
}

/** Whether the facts name an alias; without one they name the model as `<provider>/<model>`. */
function isAlias(alias: string): boolean {
  // An alias is an id, which can't hold a "/".
  return !alias.includes("/");
}

/** R4: **Run again** · link **Open *OpenAI* billing**, only for a provider whose billing page Halonic knows. */
function outOfCredit(provider: string, file: FailedModel["provider"]): RunBanner {
  const line = failureWords.outOfCredit(provider);
  const billing = file === undefined ? undefined : billingPageOf(file);
  if (billing === undefined) {
    return danger([line]);
  }
  return danger([line], {
    links: [
      {
        kind: "open-external",
        label: failureWords.openBilling(provider),
        address: billing,
        opens: failureWords.opensProvider(provider),
      },
    ],
  });
}

/** R3's line, with the tries once the engine retries a busy provider and logs them. */
function busyLine(
  provider: string,
  step: string,
  retried: { readonly tries: number; readonly overMs: number } | undefined,
): string {
  if (retried === undefined) {
    return failureWords.providerBusy(provider, step);
  }
  const minutes = Math.max(1, Math.round(retried.overMs / 60_000));
  return failureWords.providerBusyAfterTries(
    provider,
    timesInWords(retried.tries),
    `${minutes} ${minutes === 1 ? "minute" : "minutes"}`,
    step,
  );
}

/** "once", "twice", then "3 times", as the CLI says it. */
function timesInWords(times: number): string {
  if (times === 1) {
    return "once";
  }
  return times === 2 ? "twice" : `${times} times`;
}

/** Where **Open Models** goes and what it says: the alias's tab, and a label such as **Add key**. */
interface ModelsTarget {
  readonly alias?: string;
  readonly label?: string;
}

function openModels(target: ModelsTarget): BannerFix {
  return { kind: "open-models", ...target };
}
