import { type ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "../button/button.tsx";
import { AlertIcon } from "../icons/alert-icon.tsx";
import { CheckIcon } from "../icons/check-icon.tsx";
import { CloseIcon } from "../icons/close-icon.tsx";
import { InfoIcon } from "../icons/info-icon.tsx";
import { RunningIcon } from "../icons/running-icon.tsx";
import { WarningIcon } from "../icons/warning-icon.tsx";
import type { Toast, ToastTone } from "./toast-store.ts";

/** Success and info close after 5s, or 10s with an action (23 A13); the rest stay until closed. */
export const TOAST_CLOSES_AFTER_MS = 5000;
/** How long a success or info toast with an action ("Undo", "Open run") stays. */
export const TOAST_WITH_ACTION_CLOSES_AFTER_MS = 10_000;
/** The leaving fade, the same as `--duration-fast`; a test keeps the two equal. */
export const TOAST_FADE_MS = 120;

const tones: Record<ToastTone, { readonly icon: ReactNode; readonly colour: string }> = {
  success: { icon: <CheckIcon />, colour: "text-success" },
  info: { icon: <InfoIcon />, colour: "text-accent" },
  running: { icon: <RunningIcon />, colour: "text-running" },
  warning: { icon: <WarningIcon />, colour: "text-warning" },
  danger: { icon: <AlertIcon />, colour: "text-danger" },
};

/**
 * The card fades in and out; nothing slides. Forced colours drop the shadow, so a transparent
 * outline, inside the box so nothing grows, becomes its edge there.
 */
const card = [
  "pointer-events-auto flex items-start gap-2 rounded-md p-3 outline-1 outline-transparent",
  "-outline-offset-1 bg-surface-raised shadow-2 transition-opacity duration-(--duration-fast)",
  "starting:opacity-0",
].join(" ");

/**
 * A text button in `accent-text` with no padding, so a wrapped label starts at the text's left
 * edge; hover underlines it, and on touch its 48px hit area is a pseudo-element.
 */
const actionButton = [
  "rounded-xs text-left text-body-strong text-accent-text hover:underline focus-ring",
  "phone:hit-touch touch:hit-touch",
].join(" ");

export interface ToastCardProps {
  readonly toast: Toast;
  /** Not shown yet (a dialog is open, or it's next in line on a phone): read, but not drawn. */
  readonly waiting: boolean;
  /** Takes it out of the store once it has faded. */
  readonly onClosed: (id: string, hadFocus: boolean) => void;
}

/** One toast: tone icon, title and line, the action, and the close button. */
export function ToastCard({ toast, waiting, onClosed }: ToastCardProps) {
  const box = useRef<HTMLDivElement>(null);
  const [leaving, setLeaving] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);
  useLifetime(lifetime(toast), waiting || hovered || pressed || focused, () => setLeaving(true));

  useEffect(() => {
    if (!leaving) {
      return;
    }
    const timer = setTimeout(
      () => onClosed(toast.id, box.current?.contains(document.activeElement) === true),
      TOAST_FADE_MS,
    );
    return () => clearTimeout(timer);
  }, [leaving, onClosed, toast.id]);

  const tone = tones[toast.tone];
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: it only pauses its timer; its buttons take the keys
    <div
      ref={box}
      data-toast={toast.id}
      role={toast.tone === "danger" ? "alert" : "status"}
      className={waiting ? "sr-only" : `${card} ${leaving ? "opacity-0 ease-exit" : "ease-enter"}`}
      onPointerEnter={(event) => setHovered(event.pointerType === "mouse")}
      onPointerLeave={() => setHovered(false)}
      onPointerDown={(event) => setPressed(event.pointerType !== "mouse")}
      onPointerUp={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => setFocused(event.currentTarget.contains(event.relatedTarget))}
    >
      <span
        aria-hidden="true"
        className={`mt-0.5 inline-grid size-icon-sm shrink-0 place-items-center *:size-full ${tone.colour}`}
      >
        {tone.icon}
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap items-start gap-2">
        <div className="min-w-0 flex-[1_1_10rem] wrap-break-word">
          <p className="text-body-strong text-fg">{toast.title}</p>
          {toast.text === undefined ? null : (
            <p className="text-small text-fg-muted">{toast.text}</p>
          )}
        </div>
        {toast.action === undefined ? null : (
          <button
            type="button"
            className={`max-w-full flex-none ${actionButton}`}
            onClick={() => {
              toast.action?.onClick();
              setLeaving(true);
            }}
          >
            {toast.action.label}
          </button>
        )}
      </div>
      <div className="-mt-1 -mr-1 phone:-mt-3 phone:-mr-3">
        <Button
          variant="ghost"
          size="sm"
          icon={<CloseIcon />}
          label={`Close ${toast.title}`}
          onClick={() => setLeaving(true)}
        />
      </div>
    </div>
  );
}

function lifetime(toast: Toast): number | null {
  if (toast.tone !== "success" && toast.tone !== "info") {
    return null;
  }
  return toast.action === undefined ? TOAST_CLOSES_AFTER_MS : TOAST_WITH_ACTION_CLOSES_AFTER_MS;
}

/** Calls `onDone` after `ms` of not being paused; a pause keeps the time that was left. */
function useLifetime(ms: number | null, paused: boolean, onDone: () => void): void {
  const left = useRef(ms ?? 0);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    if (ms === null || paused) {
      return;
    }
    const started = Date.now();
    const timer = setTimeout(() => done.current(), left.current);
    return () => {
      clearTimeout(timer);
      left.current -= Date.now() - started;
    };
  }, [ms, paused]);
}
