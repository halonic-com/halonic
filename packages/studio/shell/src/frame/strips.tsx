import type { StripContribution } from "../points/frame.ts";
import type { Registered } from "../points/point-store.ts";
import type { WorkspaceContext } from "../workspace-context.ts";
import { type StatusBarItemProps, StatusBarItems } from "./status-bar.tsx";

/** What a strip's view gets: the context of the feature that added it. */
export type StripProps = StatusBarItemProps;

/** Props for {@link Strips}. */
export interface StripsProps {
  /** The strips features added, in order: `shell.contributions.strips.list()`. */
  readonly strips: readonly Registered<StripContribution>[];
  /** The context for a feature's strip: `shell.services.contextFor(featureId, workspace)`. */
  readonly contextFor: (featureId: string) => WorkspaceContext;
}

/**
 * The strips under the top bar (`shell.frame-strips`), such as the first-run bar, one under the
 * other in their order. Each view decides from its context whether it shows; while none draws
 * anything, the strips take no room. Like a status bar item, a strip whose view fails to load or
 * draw shows nothing, and the others stay.
 *
 * @example
 * <ShellFrame strips={<Strips strips={shell.contributions.strips.list()} contextFor={contextFor} />} …>
 */
export function Strips({ strips, contextFor }: StripsProps) {
  if (strips.length === 0) {
    return null;
  }
  return (
    <div data-strips="" className="flex shrink-0 flex-col empty:hidden">
      <StatusBarItems items={strips} contextFor={contextFor} />
    </div>
  );
}
