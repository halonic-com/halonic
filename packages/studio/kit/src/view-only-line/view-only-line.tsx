import { EyeIcon } from "../icons/eye-icon.tsx";
import { LineFrame } from "../line-frame/line-frame.tsx";

/** The props of `ViewOnlyLine`. */
export interface ViewOnlyLineProps {
  /**
   * The page's own sentence, never shortened: "View only on a phone. Edit this workflow on a
   * computer."
   */
  readonly children: string;
}

/**
 * The one line that says a page can't be changed on a phone: the eye, then the page's sentence,
 * on the LineFrame. The first thing in the page's content, at most once per page and not
 * repeated in the sheets the page opens. It has no action, isn't dismissible and isn't a live
 * region. The rest of the page shows its values as text, with no greyed-out controls.
 *
 * @example
 * <ViewOnlyLine>View only on a phone. Edit this workflow on a computer.</ViewOnlyLine>
 */
export function ViewOnlyLine({ children }: ViewOnlyLineProps) {
  return (
    <LineFrame icon={<EyeIcon />} muted>
      {children}
    </LineFrame>
  );
}
