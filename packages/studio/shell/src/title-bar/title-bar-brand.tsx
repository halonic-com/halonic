import { AppLogo } from "@halonicjs/studio-kit";
import { useNarrowWindow } from "../frame/frame-effects.ts";

/**
 * Studio's logo (the ring with its point of light, HAL-17379) and the words "Halonic Studio" at
 * the far left of the title bar (design decision HAL-8416). It is not a link and not a button.
 * Under 900px the words go and the logo stays, so the tabs keep their room; the logo then carries
 * the name "Halonic Studio". In a wide window the 20px logo sits on the rail's axis, 22px in from
 * the window's edge, with the words 8px after it (the approved mockup, v26 on HAL-20617, and the
 * look check on HAL-20960); in a narrow one the Places button comes first.
 *
 * @example
 * <ShellFrame titleBar={<><TitleBarBrand /><HistoryButtons tabs={workspace.tabs} /></>} …>
 */
export function TitleBarBrand() {
  const narrow = useNarrowWindow();
  return (
    <div
      data-title-bar-brand=""
      className={`flex shrink-0 items-center gap-2 pe-1 ${narrow ? "ps-1" : "ps-5.5"}`}
    >
      <AppLogo app="studio" label={narrow ? "Halonic Studio" : undefined} />
      {narrow ? null : <span className="text-small font-semibold text-fg">Halonic Studio</span>}
    </div>
  );
}
