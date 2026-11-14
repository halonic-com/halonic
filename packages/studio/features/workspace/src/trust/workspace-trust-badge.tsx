import type { ToastStore } from "@halonicjs/studio-kit";
import { type BadgeRegistry, trustBadgePriority } from "@halonicjs/studio-shell";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { CHANGED_BADGE, loadFailed, TRY_AGAIN } from "./trust-section-text.ts";
import { useTrustCheck } from "./use-trust-check.tsx";
import type { WorkspaceTrustControl } from "./workspace-trust-control.ts";

/** What the badge's tooltip says (states-flow-map T2). */
export const notTrustedTooltip =
  "Halonic won't start this workspace's programs or call real models until you review it. You can still read and edit everything.";

/** The tooltip when the list of trusted workspaces can't be read (T4). */
export const unreadableTooltip = "Halonic couldn't read its list of trusted workspaces.";

/** The props of {@link WorkspaceTrustBadge}. */
export interface WorkspaceTrustBadgeProps {
  /** The workspace's trust. */
  readonly trust: WorkspaceTrustControl;
  /** The workspace's name, for the toast: "Acme can run now". */
  readonly name: string;
  /** The window's toasts. */
  readonly toasts: ToastStore;
  /** The window's header badges; the badge is added while the workspace isn't trusted. */
  readonly badges: BadgeRegistry;
}

/**
 * The header badge "Not trusted yet · Review", "Changed since you trusted it · Review changes", or "Couldn't load workspace settings · Try again" and the trust check it opens (`studio.workspace-trust-ui`,
 * states-flow-map T2 to T6 and K4). Nothing shows while the workspace is trusted or before the
 * first answer. The whole badge is one button; pressing it opens the check, which is the
 * first-time check or "What changed". **Not now** is focused and closes it with nothing saved.
 * **Trust** saves the person's trust in exactly the fingerprint shown and says "Acme can run now".
 *
 * @example
 * <WorkspaceTrustBadge trust={opened.trust} name="Acme" toasts={shell.toasts} badges={shell.badges} />
 */
export function WorkspaceTrustBadge({ trust, name, toasts, badges }: WorkspaceTrustBadgeProps) {
  const badge = useSyncExternalStore(
    (onChange) => trust.subscribe(onChange),
    () => trust.badge,
  );
  const opener = useRef<HTMLElement | null>(null);
  const check = useTrustCheck(trust, name, toasts, () => opener.current);
  // The badge is added once per state, not once per render, so it reads the latest `open` here.
  const open = useRef(check.open);
  open.current = check.open;

  useEffect(() => {
    if (badge === "none") {
      return undefined;
    }
    if (badge === "failed") {
      return badges.add({
        id: "workspace-trust",
        label: loadFailed(trust.failure ?? "unknown error"),
        tone: "neutral",
        priority: trustBadgePriority,
        action: TRY_AGAIN,
        onSelect: () => void trust.retry(),
      });
    }
    return badges.add({
      id: "workspace-trust",
      label: badge === "changed" ? CHANGED_BADGE : "Not trusted yet",
      action: badge === "changed" ? "Review changes" : "Review",
      tone: "neutral",
      priority: trustBadgePriority,
      tooltip: badge === "list-unreadable" ? unreadableTooltip : notTrustedTooltip,
      onSelect: (button) => {
        opener.current = button;
        open.current();
      },
    });
  }, [badge, badges, trust]);

  return check.dialog;
}
