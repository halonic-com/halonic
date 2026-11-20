import { KindedError } from "@halonicjs/std";
import { defaultHubId, defaultHubPath, defaultHubText } from "@halonicjs/workspace";

/**
 * The hub files a new agent or workflow in `hubId` writes along with its own file: none when the
 * workspace has that hub, and the Default hub's `hub.yaml` when the workspace has no hub at all and
 * `hubId` is the Default hub (`studio.first-hub`). Written in the same change, one undo takes both
 * back. Throws `not_found` for any other hub, so no stray folder is made.
 *
 * @example
 * files.change(label, { ...hubFilesFor(hubs, hubId), [path]: text });
 */
export function hubFilesFor(
  hubs: readonly { readonly id: string }[],
  hubId: string,
): Record<string, string> {
  if (hubs.some((hub) => hub.id === hubId)) return {};
  if (hubs.length === 0 && hubId === defaultHubId) {
    return { [defaultHubPath]: defaultHubText() };
  }
  throw new KindedError("not_found", `The workspace has no hub "${hubId}".`);
}
