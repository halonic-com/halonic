import { createContext, type ReactNode, useContext, useMemo, useState } from "react";
import { PANEL_DEFAULT_WIDTH, savedPanelWidth } from "./panel-width.ts";

/** The side panel's chosen width, shared by every item page in the window. */
interface PanelWidthSetting {
  readonly width: number;
  /** Follows the edge while it moves. */
  readonly resize: (width: number) => void;
  /** Saves the width once the edge is let go. */
  readonly save: (width: number) => void;
}

const PanelWidthContext = createContext<PanelWidthSetting | undefined>(undefined);

/** Props for {@link PanelWidthProvider}. */
export interface PanelWidthProviderProps {
  /** What this computer saved last, read back with `savedPanelWidth`: 700px if it isn't a number. */
  readonly saved: unknown;
  /** Saves the width on this computer, once the panel's edge is let go. */
  readonly onSave: (width: number) => void;
  readonly children: ReactNode;
}

/**
 * Keeps the side panel's width for every item page in the window (`shell.panel-width`), so a
 * width dragged on one page is the width of the next. The host mounts it once, around the tabs'
 * pages, and saves the width on this computer, as it does the sidebar's.
 *
 * @example
 * <PanelWidthProvider saved={settings.read("panelWidth")} onSave={(w) => settings.write("panelWidth", w)}>
 *   <TabPages … />
 * </PanelWidthProvider>
 */
export function PanelWidthProvider({ saved, onSave, children }: PanelWidthProviderProps) {
  const [width, setWidth] = useState(() => savedPanelWidth(saved));
  const setting = useMemo(() => ({ width, resize: setWidth, save: onSave }), [width, onSave]);
  return <PanelWidthContext.Provider value={setting}>{children}</PanelWidthContext.Provider>;
}

/**
 * The side panel's chosen width and how to change it: `[width, resize, save]`. Outside a
 * {@link PanelWidthProvider} (a test, a preview) it starts at 700px, is kept only while the page
 * is mounted and saves nothing.
 */
export function usePanelWidth(): readonly [
  width: number,
  resize: (width: number) => void,
  save: (width: number) => void,
] {
  const shared = useContext(PanelWidthContext);
  const [local, setLocal] = useState(PANEL_DEFAULT_WIDTH);
  if (shared !== undefined) {
    return [shared.width, shared.resize, shared.save];
  }
  return [local, setLocal, ignoreSave];
}

function ignoreSave(): void {}
