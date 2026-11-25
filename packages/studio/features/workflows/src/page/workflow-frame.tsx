import {
  LetterTile,
  type MenuItem,
  PlaceIcon,
  type Tab,
  TabList,
  TabPanel,
  useTabIds,
} from "@halonicjs/studio-kit";
import {
  type CloseStack,
  ItemPage,
  type ItemPageChat,
  type ItemPageHandle,
} from "@halonicjs/studio-shell";
import { type ReactNode, type RefObject, useEffect } from "react";
import { configurationWords } from "../configuration/configuration-words.ts";
import { pageWords } from "./page-words.ts";
import type { Rename } from "./use-rename.ts";
import { WorkflowName } from "./workflow-name.tsx";
import type { WorkflowView } from "./workflow-tabs.ts";

/** Props for {@link WorkflowFrame}. */
export interface WorkflowFrameProps {
  readonly phone: boolean;
  readonly name: string;
  /** Whether the page has read the workflow: until then its name can't change. */
  readonly ready: boolean;
  readonly rename: Rename | undefined;
  readonly title: RefObject<HTMLHeadingElement | null>;
  /** The ⋮ as the page draws it on a phone, where it goes to the top bar. */
  readonly menu: ReactNode;
  /** The ⋮'s entries, for the item page's header. */
  readonly actions: readonly MenuItem[];
  readonly views: readonly [Tab<WorkflowView>, ...Tab<WorkflowView>[]];
  /** The view the page shows; on a desktop, the one the item page opens on. */
  readonly view: WorkflowView;
  /** Hears the view the user picks in the header. */
  readonly onPickView: (view: WorkflowView) => void;
  /** Hears the view the item page draws, which it remembers for the tab. */
  readonly onViewShown: (view: WorkflowView) => void;
  /** Lets the page show a view itself, such as Configuration for a problem's link. */
  readonly handle: RefObject<ItemPageHandle<WorkflowView> | null>;
  /** ▶ Run, or nothing where the workflow can't be started from the Studio. */
  readonly run: ReactNode;
  /** The bars and bands across the page under its header. */
  readonly notice: ReactNode;
  /** The Assistant's chat about the workflow; without it the page takes the full width. */
  readonly chat?: ItemPageChat | undefined;
  readonly closeStack?: CloseStack | undefined;
  /** Draws the view: the canvas, Configuration or Runs, with the cards docked beside it. */
  readonly children: (view: WorkflowView) => ReactNode;
}

/**
 * The workflow page's frame (`workflows.page.frame-and-states`). On a desktop it is the shell's
 * item page, with the Assistant's chat on the left when there is one. On a phone, the page keeps
 * its own header under the top bar, which already names the workflow.
 */
export function WorkflowFrame(props: WorkflowFrameProps) {
  const { phone, name, ready, rename, title, views, view, children } = props;
  const ids = useTabIds();
  if (phone) {
    return (
      <div className="flex size-full min-h-0 flex-col">
        <header className="flex flex-col gap-3 border-b border-border px-4 py-3">
          <div className="flex items-center gap-3">
            <LetterTile name={name} />
            <div className="flex flex-col">
              <p className="text-caption text-fg-muted">{pageWords.kind}</p>
              <h1 ref={title} tabIndex={-1} className="sr-only">
                <WorkflowName name={name} rename={rename} ready={ready} phone />
              </h1>
            </div>
            {props.menu}
          </div>
          <TabList
            label={configurationWords.tabs}
            tabs={views}
            selected={view}
            onSelect={props.onPickView}
            ids={ids}
          />
          {props.run && <div className="ms-auto">{props.run}</div>}
        </header>
        {props.notice}
        <TabPanel ids={ids} tabs={views} selected={view} className="flex min-h-0 flex-1 flex-col">
          {children(view)}
        </TabPanel>
      </div>
    );
  }
  return (
    <ItemPage<WorkflowView>
      icon={<PlaceIcon name="workflows" />}
      kind={pageWords.kindWord}
      name={name}
      // Where the host can't rename, the name stays a title (`workflows.page.rename`), and so it
      // does until the workflow is read: there's no name to change yet (HAL-18315, AS11).
      onRename={rename && ready ? (next: string) => rename.apply(next) : undefined}
      check={rename?.check}
      titleRef={title}
      actions={props.actions}
      end={props.run}
      views={views}
      firstView={view}
      handle={props.handle}
      onPickView={props.onPickView}
      notice={props.notice}
      chat={props.chat}
      closeStack={props.closeStack}
    >
      {(shown) => (
        <>
          <ShownView view={shown} onShown={props.onViewShown} />
          {children(shown)}
        </>
      )}
    </ItemPage>
  );
}

/** Tells the page the view the item page draws, after each draw that changes it. */
function ShownView(props: {
  readonly view: WorkflowView;
  readonly onShown: (view: WorkflowView) => void;
}) {
  const { view, onShown } = props;
  useEffect(() => onShown(view), [view, onShown]);
  return null;
}
