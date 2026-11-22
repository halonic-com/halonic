// The failed banner for a setup cause the engine names (`setupFailureOf`): a provider type Halonic
// can't call, a model alias the hub doesn't have, a key whose addresses leave out its provider's,
// a secrets file other users can read, or the workspace's own config (`config-banners.ts`). Read
// from the summary's cause with the CLI's own facts, before the log is needed.

import { type RunFailure, setupFailureOf } from "@halonicjs/app/run-failure";
import type { RunSummary } from "@halonicjs/events";
import { failureWords } from "../failure-words.ts";
import { configBanner, isConfigFailure } from "./config-banners.ts";
import { danger, fixInModels, openModels } from "./danger-banner.ts";
import type { BannerFix, RunBanner } from "./run-page-model.ts";

/**
 * A setup cause the engine names (`setupFailureOf`): the CLI's first line, then the fix in Studio,
 * which is Open Models rather than a file. A phone says to fix it on the computer. A secrets file
 * other users can read keeps the CLI's own fix, chmod 600, in a terminal with Copy command (F24);
 * a phone says to run it on the computer, with no button (HAL-14122). The workspace's own config,
 * such as a provider it doesn't have or a step the run can't go on from, says the CLI's two lines
 * (`config-banners.ts`). Any other cause keeps the page's other banners.
 */
export function setupBanner(
  summary: RunSummary,
  workflow: string,
  step: string,
  phone: boolean,
): RunBanner | undefined {
  const failure = setupFailureOf(summary.cause);
  if (isConfigFailure(failure)) {
    return configBanner(failure, workflow, step, phone);
  }
  switch (failure?.reason) {
    case "unknown-provider-type":
      return fixInModels(
        [
          failureWords.unknownProviderType(workflow, step, failure.provider, failure.type),
          failureWords.unknownProviderTypeFix(failure.provider),
        ],
        phone,
      );
    case "unknown-model-alias":
      return fixInModels(
        [
          failureWords.unknownModelAlias(workflow, step, failure.hub, failure.alias),
          failureWords.unknownModelAliasFix,
        ],
        phone,
      );
    case "key-address-not-allowed":
      return keyAddressBanner(failure, workflow, step, phone);
    case "secrets-file-readable": {
      // The engine's reason is `error`: only the cause tells this setup problem from a bug.
      const line = failureWords.secretsFileReadable(workflow, step, failure.file, phone);
      const copy: BannerFix = {
        kind: "copy-command",
        command: failureWords.secretsFileCommand(failure.file),
      };
      return danger([line], phone ? {} : { fixes: [copy] });
    }
    default:
      return undefined;
  }
}

/**
 * A key whose list of addresses leaves out its provider's (HAL-15523), fixed where the list that
 * refused is kept (HAL-15762): the keychain's in Models, with Open Models; the profile's secrets
 * file's, which Models doesn't edit, by `halonic models allow-address` with Copy command, as the
 * secrets file's own banner does (F24). A cause that doesn't say which names both. A phone says
 * to do it on the computer. Run again would be refused the same way until the list changes.
 */
function keyAddressBanner(
  failure: Extract<RunFailure, { reason: "key-address-not-allowed" }>,
  workflow: string,
  step: string,
  phone: boolean,
): RunBanner {
  const { provider, key, address, store } = failure;
  const cause = failureWords.keyOriginNotAllowed(workflow, step, provider, key, address);
  if (store === "keychain") {
    const fix = failureWords.keyOriginNotAllowedFix(key, address);
    return phone
      ? danger([cause, fix, failureWords.fixOnComputer(failureWords.modelsPlace)], {
          noRunAgain: true,
        })
      : danger([cause, fix], { fixes: [openModels], noRunAgain: true });
  }
  const fix =
    store === "secrets-file"
      ? failureWords.keyOriginNotAllowedCommandFix(key, address, phone)
      : failureWords.keyOriginNotAllowedEitherFix(key, address, phone);
  if (phone) return danger([cause, fix], { noRunAgain: true });
  const copy: BannerFix = {
    kind: "copy-command",
    command: failureWords.allowAddressCommand(key, address),
  };
  return danger([cause, fix], {
    fixes: store === "secrets-file" ? [copy] : [openModels, copy],
    noRunAgain: true,
  });
}
