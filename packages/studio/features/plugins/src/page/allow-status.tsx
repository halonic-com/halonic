// The plugin page's status while plugin code doesn't run in the sandbox on this computer and the
// person's yes isn't saved for the reason that holds now (the "Runs" line design section 7,
// microcopy 24.1 R13). The host still refuses the plugin's tools at every start without that yes;
// this only says so where the plugin lives, fix first and Review second (Julian, 23.3).

import { runnerUnfencedWords } from "@halonicjs/app";
import { Button, Callout, ExternalLink } from "@halonicjs/studio-kit";
import type { ReactNode, RefObject } from "react";
import { asksAboutYes, isOffHere } from "../trust/off-here.ts";
import { SANDBOX_DOCS } from "../trust/runs-line.ts";
import { type PluginUnfencedRuns, useTrustStatus } from "../trust/unfenced-status.ts";
import { ALLOW_IN_DESKTOP_APP, offUntilAllowed } from "./page-text.ts";
import { REVIEW } from "./plugin-actions.ts";
import type { InstalledPlugin } from "./plugin-pages.ts";

/** The props of {@link AllowStatus}. */
export interface AllowStatusProps {
  readonly id: string;
  readonly boxRef: RefObject<HTMLDivElement | null>;
  readonly plugin: InstalledPlugin;
  readonly unfencedRuns: PluginUnfencedRuns | undefined;
  /** View only (a phone, a served browser): R13 without **Review**, and "Allow this in the Halonic desktop app." */
  readonly viewOnly: boolean;
  /** Opens "Trust *name*?" with the checkbox. */
  readonly onReview: () => void;
  /** The status box, shown whenever no yes is needed or the host can't say. */
  readonly children: ReactNode;
}

/**
 * R13 in place of the status box, for a trusted plugin with a backend, while the host says plugin
 * code needs a yes it doesn't have (`plugins.plugin-page-needs-yes`). For any other plugin the
 * host isn't asked. The page mounts it again when the trust check closes, so a yes given there
 * takes R13 away.
 */
export function AllowStatus({
  id,
  boxRef,
  plugin,
  unfencedRuns,
  viewOnly,
  onReview,
  children,
}: AllowStatusProps) {
  const status = useTrustStatus(asksAboutYes(plugin) ? unfencedRuns : undefined);
  const { fence } = status;
  if (fence?.state !== "not-fenced" || !isOffHere(status)) return children;
  const words = runnerUnfencedWords(fence.reason, "plugin");
  return (
    <div id={id} ref={boxRef} tabIndex={-1} className="focus-ring rounded-sm">
      <Callout tone="warning" title={offUntilAllowed(plugin.name)}>
        <p>
          {words.reason} {words.fix}
        </p>
        {viewOnly ? (
          <p className="mt-2">{ALLOW_IN_DESKTOP_APP}</p>
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <ExternalLink href={`${SANDBOX_DOCS}/${words.docsKey}`}>{words.docsLabel}</ExternalLink>
            <Button variant="secondary" size="sm" onClick={onReview}>
              {REVIEW}
            </Button>
          </div>
        )}
      </Callout>
    </div>
  );
}
