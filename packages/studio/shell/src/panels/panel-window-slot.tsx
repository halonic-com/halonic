import { useEffect, useRef } from "react";
import type { CloseStack } from "../close-stack/close-stack.ts";
import { useNarrowWindow } from "../frame/frame-effects.ts";
import { PageErrorBoundary } from "../page/page-error-boundary.tsx";
import type { PanelWindowContribution } from "../points/frame.ts";
import type { Registered } from "../points/point-store.ts";
import { LoadedView } from "../view-loading.tsx";
import type { WorkspaceContext } from "../workspace-context.ts";

/** What the view of a panel window gets. It draws the kit's `SidePanel`, with ✕ in its actions. */
export interface PanelWindowViewProps {
  /** The context of the feature that added the panel. */
  readonly context: WorkspaceContext;
  /** The contribution's title, for the `SidePanel`'s `label`: "Assistant". */
  readonly title: string;
  /** Closes the panel, for its ✕; focus goes back as `PanelWindowControl.hide` says. */
  readonly onClose: () => void;
}

/** Props for {@link PanelWindowSlot}. */
export interface PanelWindowSlotProps {
  readonly panel: Registered<PanelWindowContribution>;
  /** The panel's `id`, which the title bar button names in `aria-controls`. */
  readonly id: string;
  readonly context: WorkspaceContext;
  /** The window's close stack: the open panel is its `side-panel` layer. */
  readonly closeStack: CloseStack;
  /** Closes the panel. It must keep its identity across renders. */
  readonly onClose: () => void;
}

/**
 * The open side panel (`shell.panel-window`, component specs 12 S-D1 and S-D5): on a wide window
 * docked at the right of the content area, 360px (`w-panel`), between the title bar and the status
 * bar; under 900px over the whole content area, while the frame makes the page inert. The view
 * draws its frame, so the panel's header and ✕ are the feature's.
 *
 * Esc closes it only while focus is inside it, as the last layer of the window's close stack.
 * While its code loads it shows the loading rows named by its title; a view that fails shows
 * "This page stopped working" in its place, and Esc and the title bar button still close it.
 */
export function PanelWindowSlot(props: PanelWindowSlotProps) {
  const { panel, closeStack, onClose } = props;
  const box = useRef<HTMLDivElement>(null);
  const narrow = useNarrowWindow();
  useEffect(
    () =>
      closeStack.open({
        kind: "side-panel",
        isActive: () => box.current?.contains(document.activeElement) === true,
        close: () => {
          onClose();
          return true;
        },
      }),
    [closeStack, onClose],
  );
  return (
    <div
      ref={box}
      id={props.id}
      data-panel-window={panel.id}
      className={
        narrow ? "absolute inset-0 z-20 flex bg-surface" : "flex w-panel shrink-0 bg-surface"
      }
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <PageErrorBoundary pageKey={panel.id} pageName={panel.title}>
          <LoadedView<PanelWindowViewProps>
            view={panel}
            name={panel.title}
            props={{ context: props.context, title: panel.title, onClose }}
          />
        </PageErrorBoundary>
      </div>
    </div>
  );
}
