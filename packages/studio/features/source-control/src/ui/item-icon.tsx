import { FileIcon, PlaceIcon, SectionIcon, SettingsIcon } from "@halonicjs/studio-kit";
import type { ReactNode } from "react";
import type { ItemKind } from "../change-items.ts";

/**
 * The icon of each kind: the sidebar place where its items are, or the Settings section where it
 * is set up. A workflow test sits with its workflow; a hub's and the workspace's own files are
 * their settings.
 */
const kindIcons: { readonly [Kind in ItemKind]: () => ReactNode } = {
  agent: () => <PlaceIcon name="agents" />,
  workflow: () => <PlaceIcon name="workflows" />,
  workflowTest: () => <PlaceIcon name="workflows" />,
  routine: () => <PlaceIcon name="routines" />,
  skill: () => <PlaceIcon name="library" />,
  knowledge: () => <PlaceIcon name="library" />,
  collection: () => <PlaceIcon name="library" />,
  provider: () => <SectionIcon name="models" />,
  models: () => <SectionIcon name="models" />,
  runtime: () => <SectionIcon name="agent-sandbox" />,
  connector: () => <SectionIcon name="plugins" />,
  integration: () => <SectionIcon name="plugins" />,
  plugin: () => <SectionIcon name="plugins" />,
  hub: () => <SettingsIcon />,
  workspace: () => <SettingsIcon />,
  deployments: () => <SettingsIcon />,
};

/**
 * An item's icon, the same wherever Changes shows the item: the list, Create version and a
 * version's contents. A file no kind places has the file icon.
 */
export function ItemIcon({ kind }: { readonly kind: ItemKind | undefined }): ReactNode {
  return kind === undefined ? <FileIcon /> : kindIcons[kind]();
}
