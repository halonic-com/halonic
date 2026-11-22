import { HalonicMark } from "@halonicjs/studio-kit";
import { useNarrowWindow } from "../frame/frame-effects.ts";

/**
 * The Halonic mark and the words "Halonic Studio" at the far left of the title bar (design
 * decision HAL-8416). It is not a link and not a button. Under 900px the words go and the mark
 * stays, so the tabs keep their room; the mark then carries the name "Halonic Studio".
 *
 * @example
 * <ShellFrame titleBar={<><TitleBarBrand /><HistoryButtons tabs={workspace.tabs} /></>} …>
 */
export function TitleBarBrand() {
  const narrow = useNarrowWindow();
  return (
    <div className="flex shrink-0 items-center gap-2 pe-1 ps-1">
      <HalonicMark label={narrow ? "Halonic Studio" : undefined} />
      {narrow ? null : <span className="text-small font-semibold text-fg">Halonic Studio</span>}
    </div>
  );
}
