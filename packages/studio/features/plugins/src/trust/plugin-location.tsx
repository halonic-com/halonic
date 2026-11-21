// Where a plugin sits and which files its fingerprint covers, in its trust check.

import type { PluginTrustFiles } from "@halonicjs/app";
import { markHiddenName } from "@halonicjs/std";
import type { ReactNode } from "react";
import { FILES_HEADING, FOLDER_HEADING, moreFilesRow } from "./trust-text.ts";

/**
 * Where the plugin sits and which files its fingerprint covers, as `halonic plugin add` shows
 * them. Both come from the workspace, so they are plain text in monospace that wraps at any
 * character, never cut short, with each hidden or direction-changing character written out as a
 * marker (`⟦U+202E⟧`): a person deciding to trust it should see exactly where it sits.
 */
export function Location({
  folder,
  files,
}: {
  readonly folder: string | undefined;
  readonly files: PluginTrustFiles | undefined;
}) {
  const shown = files?.shown ?? [];
  return (
    <div className="flex flex-col gap-3">
      {folder === undefined ? null : (
        <Labelled label={FOLDER_HEADING} stacked>
          <code className="font-mono text-small wrap-anywhere">{markHiddenName(folder)}</code>
        </Labelled>
      )}
      {shown.length === 0 ? null : (
        <Labelled label={FILES_HEADING} stacked>
          <ul className="flex list-none flex-col gap-0.5">
            {shown.map((path) => (
              <li key={path}>
                <code className="font-mono text-small wrap-anywhere">{markHiddenName(path)}</code>
              </li>
            ))}
            {files === undefined || files.more === 0 ? null : (
              <li className="text-small text-fg-muted">{moreFilesRow(files.more)}</li>
            )}
          </ul>
        </Labelled>
      )}
    </div>
  );
}

/** A label over its value, as the design's open rows show them. */
export function Labelled({
  label,
  children,
  stacked = false,
}: {
  readonly label: string;
  readonly children: ReactNode;
  /** The value sits on lines under the label, as a list does. */
  readonly stacked?: boolean;
}) {
  if (stacked) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-small text-fg-muted">{label}</span>
        {children}
      </div>
    );
  }
  return (
    <p className="text-small wrap-anywhere">
      <span className="text-fg-muted">{label} </span>
      {children}
    </p>
  );
}

/** A section's list of things, under its row. */
export function Items({ children }: { readonly children: ReactNode }) {
  return <ul className="mt-2 mb-3 flex list-none flex-col gap-3">{children}</ul>;
}
