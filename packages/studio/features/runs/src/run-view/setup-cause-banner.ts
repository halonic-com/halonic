// The failed banner for a setup cause the engine names (`setupFailureOf`): a provider type Halonic
// can't call, a model alias the hub doesn't have, or a secrets file other users can read. Read
// from the summary's cause with the CLI's own facts, before the log is needed.

import { setupFailureOf } from "@halonicjs/app/run-failure";
import type { RunSummary } from "@halonicjs/events";
import { failureWords } from "../failure-words.ts";
import { danger, fixInModels } from "./danger-banner.ts";
import type { BannerFix, RunBanner } from "./run-page-model.ts";

/**
 * A setup cause the engine names (`setupFailureOf`): the CLI's first line, then the fix in Studio,
 * which is Open Models rather than a file. A phone says to fix it on the computer. A secrets file
 * other users can read keeps the CLI's own fix, chmod 600, in a terminal with Copy command (F24);
 * a phone says to run it on the computer, with no button (HAL-14122). Any other cause keeps the
 * page's other banners.
 */
export function setupBanner(
  summary: RunSummary,
  workflow: string,
  step: string,
  phone: boolean,
): RunBanner | undefined {
  const failure = setupFailureOf(summary.cause);
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
