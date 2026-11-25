import { useOpenExternal } from "@halonicjs/studio-kit";
import type { PlaceViewProps } from "@halonicjs/studio-shell";
import { useMemo } from "react";
import { PullRequestsService } from "../api.ts";
import type { WebLinkOpener } from "./pull-request-row.tsx";
import { PullRequestsPage } from "./pull-requests-page.tsx";

/**
 * The Pull requests place under the sidebar's Team group: the screen with this workspace's reads.
 * Studio doesn't know the connection's Paperclip address yet, so only GitHub's PR pages open, in
 * the system browser through the shell's `openExternal`; Paperclip links draw no button. It gets
 * no `onLink`, as Spend and seats doesn't: no "Connect again" button that does nothing.
 */
export function PullRequestsPlace({ context }: PlaceViewProps) {
  const openExternal = useOpenExternal();
  const opener = useMemo<WebLinkOpener>(
    () => ({
      connectionOrigin: undefined,
      open: (link) => {
        openExternal(link).catch((error: unknown) =>
          console.error("A pull request's page couldn't be opened:", error),
        );
      },
    }),
    [openExternal],
  );
  return (
    <PullRequestsPage pullRequests={context.services.get(PullRequestsService)} opener={opener} />
  );
}
