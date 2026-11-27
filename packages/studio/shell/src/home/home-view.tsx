import { FramedPanel, SidebarFrame } from "@halonicjs/studio-kit";
import { type ReactNode, useState } from "react";
import type {
  HomeContentPaneProps,
  HomeListColumnProps,
  HomeViewContribution,
} from "../points/home.ts";
import type { Registered } from "../points/point-store.ts";
import { LoadedView } from "../view-loading.tsx";
import type { WorkspaceContext } from "../workspace-context.ts";

/** Props for {@link HomeView}. */
export interface HomeViewProps {
  /** The view a feature set with `home.setView`. */
  readonly view: Registered<HomeViewContribution>;
  /** The context of the feature that set it. */
  readonly context: WorkspaceContext;
  /** Home's sections, for the content pane while no item is open. */
  readonly sections: ReactNode;
  /** The page's name while a slot loads: "Home". */
  readonly name: string;
}

/**
 * Home with a feature's view (`shell.home-view`): its list column beside its content pane, on the
 * frame the Messenger and the Inbox share. The shell keeps which item is open, so the two slots
 * load apart and still agree.
 */
export function HomeView({ view, context, sections, name }: HomeViewProps) {
  const [open, setOpen] = useState<string | undefined>(undefined);
  const slot = { context, open, setOpen };
  return (
    <SidebarFrame
      sidebar={<LoadedView<HomeListColumnProps> view={view.listColumn} name={name} props={slot} />}
    >
      <FramedPanel as="main">
        <LoadedView<HomeContentPaneProps>
          view={view.contentPane}
          name={name}
          props={{ ...slot, sections }}
        />
      </FramedPanel>
    </SidebarFrame>
  );
}
