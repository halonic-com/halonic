import {
  AlertIcon,
  Button,
  RefreshIcon,
  StatusChip,
  TickIcon,
  Tooltip,
  WarningIcon,
} from "@halonicjs/studio-kit";
import type { ReactNode } from "react";
import * as text from "../sandbox-choice-text.ts";
import type {
  SandboxBadge,
  SandboxStatusAction,
  SandboxStatusRow,
} from "../sandbox-status-view.ts";

/** The props of {@link SandboxBadgeButton}. */
export interface SandboxBadgeButtonProps {
  /** From `sandboxStatusView`; `null` shows nothing. */
  readonly badge: SandboxBadge | null;
  /** Opens Settings › Agent sandbox. */
  readonly onOpen: () => void;
}

/** An icon next to the words, so the state never rests on colour (HAL-3777 plan, the visible badge). */
const badgeIcons: Partial<Record<SandboxBadge["tone"], ReactNode>> = {
  success: <TickIcon />,
  attention: <WarningIcon />,
  danger: <AlertIcon />,
};

/**
 * The header badge (`settings.sandbox-status-ui`): the state in words and an icon, and a press
 * opens Settings › Agent sandbox. Screen readers hear its words, then "Opens sandbox settings."
 * ("Sandbox: on. Opens sandbox settings."), so voice control finds it by what it shows.
 */
export function SandboxBadgeButton({ badge, onOpen }: SandboxBadgeButtonProps) {
  if (badge === null) return null;
  return (
    <Tooltip text={text.BADGE_TOOLTIP}>
      {(trigger) => (
        <Button
          variant="ghost"
          size="sm"
          icon={badgeIcons[badge.tone]}
          onClick={onOpen}
          {...trigger}
        >
          <span aria-hidden="true">
            <StatusChip tone={badge.tone}>{badge.label}</StatusChip>
          </span>
          <span className="sr-only">{badge.name}</span>
        </Button>
      )}
    </Tooltip>
  );
}

/** The props of {@link SandboxStatusRowView}. */
export interface SandboxStatusRowViewProps {
  /** From `sandboxStatusView`. */
  readonly row: SandboxStatusRow;
  /** Reports which button was pressed; Change opens the cards, Turn off the confirmation. */
  readonly onAction: (action: SandboxStatusAction) => void;
}

const actionLabels: Record<SandboxStatusAction, string> = {
  "set-up": text.SET_UP_A_SANDBOX,
  restart: text.RESTART_NOW,
  "check-again": text.CHECK_AGAIN,
  change: text.CHANGE,
  "turn-off": text.TURN_OFF,
};

/** The one step that moves the person on; every other action is quiet. */
const primaryActions: ReadonlySet<SandboxStatusAction> = new Set(["set-up", "restart"]);

/**
 * The status row at the top of Settings › Agent sandbox (`settings.sandbox-status-ui`): the
 * state chip, its sentence and the buttons the view picks. It decides nothing and only reports the
 * pressed button. A change of state is said in the polite live region.
 */
export function SandboxStatusRowView({ row, onAction }: SandboxStatusRowViewProps) {
  return (
    <div className="flex max-w-120 flex-col gap-3">
      <div className="flex flex-col gap-1" aria-live="polite">
        {/* `self-start`: the column stretches its children, and a chip is as wide as its word. */}
        <span className="self-start">
          <StatusChip tone={row.tone}>{row.state}</StatusChip>
        </span>
        {row.line === null ? null : <p className="text-small">{row.line}</p>}
      </div>
      {row.actions.length === 0 ? null : (
        <div className="flex flex-wrap gap-2">
          {row.actions.map((action) => (
            <Button
              key={action}
              variant={primaryActions.has(action) ? "primary" : "ghost"}
              size={primaryActions.has(action) ? "md" : "sm"}
              {...(action === "check-again" ? { icon: <RefreshIcon /> } : {})}
              busy={action === "check-again" && row.checkBusy}
              onClick={() => onAction(action)}
            >
              {actionLabels[action]}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
