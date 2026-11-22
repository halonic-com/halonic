import { LetterTile, type Tab, TabList, TabPanel, useTabIds } from "@halonicjs/studio-kit";
import type { ReactNode, Ref } from "react";
import { pageWords } from "./page-words.ts";

/** Props for {@link AgentPhoneFrame}. */
export interface AgentPhoneFrameProps<View extends string> {
  readonly name: string;
  /** The page's `h1`, which a **Try again** or an Undo gives the focus. */
  readonly titleRef: Ref<HTMLHeadingElement>;
  /** The page's ⋮, which goes to the phone's top bar where there is one. */
  readonly menu: ReactNode;
  readonly views: readonly Tab<View>[];
  readonly view: View;
  readonly onPickView: (view: View) => void;
  /** The lines under the header: "Changes not live yet", a save that failed. */
  readonly notice: ReactNode;
  /** The picked view. */
  readonly children: ReactNode;
}

/**
 * The agent page on a phone (flow-agents 8): the letter avatar and "AGENT" over the views. The top
 * bar already names the agent, so the page's `h1` is for screen readers only, and the name is
 * changed from the agents list rather than here.
 */
export function AgentPhoneFrame<View extends string>({
  name,
  titleRef,
  menu,
  views,
  view,
  onPickView,
  notice,
  children,
}: AgentPhoneFrameProps<View>) {
  const ids = useTabIds();
  return (
    <div className="flex size-full min-h-0 flex-col">
      <header className="flex flex-col gap-3 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <LetterTile name={name} />
          <div className="flex flex-col">
            <p className="text-caption text-fg-muted">{pageWords.kind}</p>
            <h1 ref={titleRef} tabIndex={-1} className="sr-only">
              {name}
            </h1>
          </div>
          {menu}
        </div>
        <TabList
          label={pageWords.views}
          tabs={views}
          selected={view}
          onSelect={onPickView}
          ids={ids}
        />
      </header>
      {notice}
      <TabPanel ids={ids} tabs={views} selected={view} className="flex min-h-0 flex-1 flex-col">
        {children}
      </TabPanel>
    </div>
  );
}
