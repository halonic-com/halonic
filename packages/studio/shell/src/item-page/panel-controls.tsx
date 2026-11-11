import {
  BackIcon,
  Button,
  CloseIcon,
  MaximiseIcon,
  RestoreIcon,
  Tooltip,
} from "@halonicjs/studio-kit";
import type { ItemLayout } from "./item-layout.ts";

/** Props for {@link PanelControls}. */
export interface PanelControlsProps {
  readonly layout: ItemLayout;
  /** Whether the panel covers the tab (`shell.panel-maximise`); only beside the chat. */
  readonly maximised: boolean;
  readonly idBase: string;
  readonly kind: string;
  readonly viewLabel: string;
  readonly onAsk: () => void;
  readonly onToggleMaximise: () => void;
  readonly onClosePanel: () => void;
  readonly onReopenPanel: () => void;
  readonly onPanelScreen: () => void;
  readonly onBackToChat: () => void;
}

/**
 * The header's controls for the chat and the panel, after the item's own: "Ask about…", the
 * panel's ⤢ and ✕, the button that shows the panel again, or **← Chat**, one layout's at a time.
 */
export function PanelControls({
  layout,
  maximised,
  idBase,
  kind,
  viewLabel,
  ...on
}: PanelControlsProps) {
  switch (layout.shows) {
    case "view":
      return layout.ask ? (
        <Button variant="secondary" size="sm" id={`${idBase}-ask`} onClick={on.onAsk}>
          {`Ask about this ${kind.toLowerCase()}…`}
        </Button>
      ) : null;
    case "chat-and-panel":
      return (
        <>
          <MaximiseButton
            maximised={maximised}
            idBase={idBase}
            viewLabel={viewLabel}
            onToggle={on.onToggleMaximise}
          />
          <Button
            variant="ghost"
            size="sm"
            icon={<CloseIcon />}
            label={`Close ${viewLabel}`}
            onClick={on.onClosePanel}
          />
        </>
      );
    case "chat":
      return (
        <Button
          variant="secondary"
          size="sm"
          id={`${idBase}-show-panel`}
          onClick={layout.panelControl === "reopen" ? on.onReopenPanel : on.onPanelScreen}
        >
          {viewLabel}
        </Button>
      );
    case "panel-screen":
      return (
        <Button
          variant="ghost"
          size="sm"
          icon={<BackIcon />}
          id={`${idBase}-back-to-chat`}
          onClick={on.onBackToChat}
        >
          Chat
        </Button>
      );
  }
}

interface MaximiseButtonProps {
  readonly maximised: boolean;
  readonly idBase: string;
  readonly viewLabel: string;
  readonly onToggle: () => void;
}

/**
 * ⤢ "Maximise Flow", and the restore mark "Restore Flow" while the panel covers the tab. It is one
 * button whose icon and name change, so focus stays on it when it's pressed. Its tooltip says its
 * name, since the icon alone doesn't.
 */
function MaximiseButton({ maximised, idBase, viewLabel, onToggle }: MaximiseButtonProps) {
  const name = `${maximised ? "Restore" : "Maximise"} ${viewLabel}`;
  return (
    <Tooltip text={name} isName>
      {(linked) => (
        <Button
          {...linked}
          variant="ghost"
          size="sm"
          icon={maximised ? <RestoreIcon /> : <MaximiseIcon />}
          label={name}
          id={`${idBase}-maximise`}
          onClick={onToggle}
        />
      )}
    </Tooltip>
  );
}
