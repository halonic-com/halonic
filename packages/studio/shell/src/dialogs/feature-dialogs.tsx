import { Suspense } from "react";
import { lazyView } from "../lazy-view.ts";
import type { DialogHostContribution } from "../points/frame.ts";
import type { Registered } from "../points/point-store.ts";
import { ViewErrorBoundary } from "../view-error-boundary.tsx";
import type { WorkspaceContext } from "../workspace-context.ts";

/** What a feature's dialog host view gets: the context of the feature that added it. */
export interface DialogHostProps {
  readonly context: WorkspaceContext;
}

/** Props for {@link FeatureDialogs}. */
export interface FeatureDialogsProps {
  /** The hosts features added, in order: `shell.contributions.dialogs.list()`. */
  readonly hosts: readonly Registered<DialogHostContribution>[];
  /** The context for a feature's host: `shell.services.contextFor(featureId, workspace)`. */
  readonly contextFor: (featureId: string) => WorkspaceContext;
}

/**
 * The features' dialog hosts (`shell.feature-dialogs`), each drawn once with its feature's
 * context. A host whose view fails to load or draw shows nothing, and the window stays.
 *
 * @example
 * <FeatureDialogs hosts={shell.contributions.dialogs.list()} contextFor={contextFor} />
 */
export function FeatureDialogs({ hosts, contextFor }: FeatureDialogsProps) {
  return hosts.map((host) => (
    <FeatureDialogHost key={host.id} host={host} context={contextFor(host.featureId)} />
  ));
}

function FeatureDialogHost({
  host,
  context,
}: {
  readonly host: Registered<DialogHostContribution>;
  readonly context: WorkspaceContext;
}) {
  const View = lazyView<DialogHostProps>(host);
  return (
    <ViewErrorBoundary>
      <Suspense fallback={null}>
        <View context={context} />
      </Suspense>
    </ViewErrorBoundary>
  );
}
