import { AgentOrb } from "@halonicjs/studio-kit";
import type { RefObject } from "react";

/** Props for {@link PhonePanelButton}. */
export interface PhonePanelButtonProps {
  /** The panel's title, the button's name: "Assistant". */
  readonly title: string;
  readonly onOpen: () => void;
  /** The same button the title bar's has, where focus goes when the panel closes. */
  readonly ref: RefObject<HTMLButtonElement | null>;
}

/** The Assistant's orb in the halo's two colours, so a frame colour preset recolours it too. */
const haloColors = ["var(--halo-blue)", "var(--halo-violet)"] as const;

/**
 * The phone top bar's **Assistant** (`shell.phone-panel`, component specs 15.1): a 48px icon
 * button named by the panel's title, with the 24px orb, that opens the panel as a full page. A
 * page, not a toggle, so it says nothing about being expanded: the panel covers the bar. The
 * button takes the focus when pressed, since a tap doesn't focus a button in every browser, and
 * the panel gives the focus back to what had it.
 *
 * Built by hand, not as the kit's ghost `Button`, because that button draws its icon at 20px on a
 * phone and the orb is 24px. So it takes the kit button's see-through 1px border itself: in high
 * contrast the border shows, as **Search**'s does next to it (component specs 15.1).
 *
 * @example
 * <PhonePanelButton title="Assistant" onOpen={panelWindow.show} ref={button} />
 */
export function PhonePanelButton({ title, onOpen, ref }: PhonePanelButtonProps) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={title}
      className="inline-grid size-touch shrink-0 place-items-center rounded-sm border border-transparent outline-none focus-ring hover:bg-surface-muted active:bg-surface-muted"
      onClick={(event) => {
        event.currentTarget.focus();
        onOpen();
      }}
    >
      <AgentOrb agentId="assistant" colors={haloColors} size={24} />
    </button>
  );
}
