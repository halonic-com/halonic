import { Button, Callout, DashedRingIcon } from "@halonicjs/studio-kit";
import { useState } from "react";
import type { PluginCardStatus } from "../cards/plugin-card.tsx";
import { CHANGED_LINE, NOT_TRUSTED_LINE } from "../panel/panel-text.ts";
import {
  CANT_LOAD_LINE,
  cantLoadTitle,
  changedSince,
  NOT_TRUSTED_YET,
  ON,
  onLine,
  trustedDay,
} from "./page-text.ts";
import { CHECK_AGAIN, CHECKING, OPEN_FOLDER, REVIEW, REVIEW_CHANGES } from "./plugin-actions.ts";
import type { InstalledPlugin, PluginLoadProblem } from "./plugin-pages.ts";

/** The one status box (T12): on, not trusted yet, changed, or the can't-load Callout. */
export function StatusBox({
  id,
  plugin,
  now,
  onCheckAgain,
  onOpenFolder,
  onReview,
}: {
  readonly id: string;
  readonly plugin: InstalledPlugin;
  readonly now: () => Date;
  readonly onCheckAgain: () => Promise<void>;
  readonly onOpenFolder: () => void;
  /** Opens the trust check, for a plugin that isn't trusted or has changed. */
  readonly onReview: () => void;
}) {
  const [checking, setChecking] = useState(false);
  if (plugin.status === "cant-load") {
    const checkAgain = async () => {
      setChecking(true);
      await onCheckAgain();
      setChecking(false);
    };
    return (
      <div id={id}>
        <Callout tone="danger" title={cantLoadTitle(plugin.name)}>
          <p>{CANT_LOAD_LINE}</p>
          <Problems problems={plugin.problems} />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              busy={checking}
              busyLabel={CHECKING}
              onClick={() => void checkAgain()}
            >
              {CHECK_AGAIN}
            </Button>
            <Button variant="ghost" size="sm" onClick={onOpenFolder}>
              {OPEN_FOLDER}
            </Button>
          </div>
        </Callout>
      </div>
    );
  }
  const trusted = trustedDay(plugin.trustedAt, now());
  const box = statusWords(plugin.status, plugin, trusted);
  return (
    <div id={id} className="flex gap-2 rounded-md bg-surface-subtle p-3">
      <span
        aria-hidden="true"
        className="inline-grid size-icon-sm shrink-0 place-items-center *:size-full"
      >
        {plugin.status === "on" ? "✓" : <DashedRingIcon />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-body-strong">{box.title}</p>
        {box.line === "" ? null : (
          <p className="text-small text-fg-muted wrap-anywhere">{box.line}</p>
        )}
        {plugin.status === "on" || plugin.manifest === undefined ? null : (
          <div className="mt-2">
            <Button variant="secondary" size="sm" onClick={onReview}>
              {plugin.status === "changed" ? REVIEW_CHANGES : REVIEW}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function statusWords(
  status: Exclude<PluginCardStatus, "cant-load">,
  plugin: InstalledPlugin,
  trusted: string | undefined,
): { readonly title: string; readonly line: string } {
  switch (status) {
    case "on":
      return {
        title: ON,
        line:
          plugin.manifest === undefined
            ? ""
            : onLine(trusted, plugin.manifest.version, plugin.origin),
      };
    case "changed":
      return { title: changedSince(trusted), line: CHANGED_LINE };
    case "not-trusted":
      return { title: NOT_TRUSTED_YET, line: NOT_TRUSTED_LINE };
  }
}

/** Each problem: where, in mono, then the loader's message, as plain text. */
function Problems({ problems }: { readonly problems: readonly PluginLoadProblem[] }) {
  if (problems.length === 0) return null;
  return (
    <ul className="mt-2 flex list-none flex-col gap-1">
      {problems.map((problem, index) => {
        const place = problemPlace(problem);
        return (
          // The loader can give two problems at the same place, so the index keeps keys apart.
          <li key={index} className="wrap-anywhere">
            {place === "" ? null : (
              <>
                <span className="font-mono">{place}</span>{" "}
              </>
            )}
            <span>{problem.message}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** "plugin.yaml ui.commands.0.tool", or just the file, or `""` for the folder itself. */
function problemPlace(problem: PluginLoadProblem): string {
  return [problem.file, problem.path.map(String).join(".")].filter((part) => part !== "").join(" ");
}
