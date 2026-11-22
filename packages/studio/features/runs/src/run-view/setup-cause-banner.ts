// The failed banner for a setup cause the engine names (`setupFailureOf`): a provider type Halonic
// can't call, a model alias the hub doesn't have, a key whose addresses leave out its provider's,
// a secrets file other users can read, or the workspace's own config (`config-banners.ts`). Read
// from the summary's cause with the CLI's own facts, before the log is needed.

import { setupFailureOf } from "@halonicjs/app/run-failure";
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
    case "key-address-not-allowed": {
      // Run again would be refused the same way until the key's addresses change (HAL-15523).
      const lines = [
        failureWords.keyOriginNotAllowed(
          workflow,
          step,
          failure.provider,
          failure.key,
          failure.address,
        ),
        failureWords.keyOriginNotAllowedFix(failure.key, failure.address),
      ];
      return phone
        ? danger([...lines, failureWords.fixOnComputer(failureWords.modelsPlace)], {
            noRunAgain: true,
          })
        : danger(lines, { fixes: [openModels], noRunAgain: true });
    }
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
