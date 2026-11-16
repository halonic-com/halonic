import type { SandboxBackendId, SandboxBackendStatus, SandboxChoice } from "@halonicjs/app";
import { type SandboxUnavailableReason, sandboxUnavailableReasons } from "@halonicjs/ports";
import * as text from "./sandbox-choice-text.ts";

/** How a card can be used: `current` is the backend in use, `disabled` shows its `disabledReason`. */
export type SandboxCardUse = "selectable" | "current" | "disabled";

/** One backend as the first screen (S1) and Other options (S2) show it. */
export interface SandboxCard {
  id: SandboxBackendId;
  name: string;
  subtitle: string;
  /** The icon lines of what will happen on this computer (permission, restart, speed); empty when there is nothing to say yet. */
  whatHappens: string[];
  /** The one caveat that matters on this computer, or `null`. */
  caveat: string | null;
  /** A warning that is always visible, never under More info, or `null`. */
  warning: string | null;
  badge: string | null;
  use: SandboxCardUse;
  /** Why the card is disabled, as a sentence; `null` unless `use` is `disabled`. */
  disabledReason: string | null;
  /** Cloud needs an explicit checkbox before its button enables. */
  needsConfirmation: boolean;
  /** The checkbox label for `needsConfirmation`, or `null`. */
  confirmation: string | null;
  /** The primary button's label. */
  action: string;
}

/** What the choice screens show: the recommended card, the list for Other options and the no-sandbox link. */
export interface SandboxChoiceView {
  /** The recommended backend's card for S1, or `null` when this computer doesn't offer it. */
  recommended: SandboxCard | null;
  /** Every offered backend for S2: the recommended one first, then the rest in the host's order. */
  options: SandboxCard[];
}

/**
 * Turns the engine's {@link SandboxChoice} into the cards of S1 and S2 for this platform
 * (`settings.sandbox-choice-view`). The recommended backend is Sandbox in WSL on Windows and the plain
 * sandbox elsewhere; the native one on Windows is Experimental. A backend the computer doesn't offer is left
 * out, and one that can't run is shown disabled with the reason.
 *
 * @param platform the operating system, as Node's `process.platform` names it
 *
 * @example
 * sandboxChoiceView(choice, "win32").recommended?.name; // "Sandbox for Windows"
 */
export function sandboxChoiceView(choice: SandboxChoice, platform: string): SandboxChoiceView {
  const windows = platform === "win32";
  const recommendedId: SandboxBackendId = windows ? "srt-wsl" : "srt";
  const cards = choice.backends
    .filter((backend) => backend.offered)
    .map((backend) =>
      cardOf(backend, { platform, windows, recommended: backend.id === recommendedId }),
    );
  const recommended = cards.find((card) => card.id === recommendedId) ?? null;
  const rest = cards.filter((card) => card.id !== recommendedId);
  return { recommended, options: recommended === null ? rest : [recommended, ...rest] };
}

interface Where {
  platform: string;
  windows: boolean;
  recommended: boolean;
}

function cardOf(backend: SandboxBackendStatus, where: Where): SandboxCard {
  const { disabled, current } = useOf(backend);
  const card = describe(backend.id, where);
  let use: SandboxCardUse = "selectable";
  if (disabled !== null) use = "disabled";
  else if (current) use = "current";
  return {
    id: backend.id,
    ...card,
    badge: current ? text.BADGE_IN_USE : card.badge,
    use,
    disabledReason: disabled,
    needsConfirmation: backend.id === "cloud",
    confirmation: backend.id === "cloud" ? text.CLOUD_CONFIRMATION : null,
    action: text.SET_UP,
  };
}

function useOf(backend: SandboxBackendStatus): { disabled: string | null; current: boolean } {
  switch (backend.state) {
    case "in-use":
      return { disabled: null, current: true };
    case "check-failed":
      return { disabled: text.STATE_FAILED, current: false };
    case "not-available":
      return { disabled: text.unavailable(reasonOf(backend)), current: false };
    default:
      return { disabled: null, current: false };
  }
}

/** The reason code of a `not-available` backend; a trust-check code or none reads as `other`. */
function reasonOf(backend: SandboxBackendStatus): SandboxUnavailableReason {
  const reason = backend.reason;
  return reason === null || !isUnavailableReason(reason) ? "other" : reason;
}

const unavailableReasons: readonly string[] = sandboxUnavailableReasons;

function isUnavailableReason(reason: string): reason is SandboxUnavailableReason {
  return unavailableReasons.includes(reason);
}

type Described = Pick<
  SandboxCard,
  "name" | "subtitle" | "whatHappens" | "caveat" | "warning" | "badge"
>;

const nativeLines = (permission: string) => [permission, text.RESTART_NO, text.SPEED_NATIVE];

function describe(id: SandboxBackendId, where: Where): Described {
  const badge = where.recommended ? text.BADGE_RECOMMENDED : null;
  switch (id) {
    case "srt-wsl":
      return {
        name: text.NAME_SANDBOX_WSL,
        subtitle: where.recommended ? text.WSL_RECOMMENDED_SUBTITLE : text.WSL_SUBTITLE,
        whatHappens: [text.PERMISSION_WINDOWS, text.RESTART_YES, text.SPEED_WSL],
        caveat: null,
        warning: null,
        badge,
      };
    case "srt":
      return where.windows
        ? {
            name: text.NAME_SANDBOX_WINDOWS,
            subtitle: text.WINDOWS_SUBTITLE,
            whatHappens: nativeLines(text.PERMISSION_WINDOWS),
            caveat: text.WINDOWS_NETWORK_CAVEAT,
            warning: null,
            badge: text.BADGE_EXPERIMENTAL,
          }
        : {
            name: text.NAME_SANDBOX,
            subtitle: text.SANDBOX_SUBTITLE,
            whatHappens: nativeLines(
              where.platform === "darwin" ? text.PERMISSION_MACOS : text.PERMISSION_LINUX,
            ),
            caveat: null,
            warning: null,
            badge,
          };
    case "mxc":
      return {
        name: text.NAME_MXC,
        subtitle: text.MXC_SUBTITLE,
        whatHappens: [],
        caveat: null,
        warning: null,
        badge: text.BADGE_EXPERIMENTAL,
      };
    case "docker-sbx":
      return {
        name: text.NAME_DOCKER,
        subtitle: text.DOCKER_SUBTITLE,
        whatHappens: [],
        caveat: null,
        warning: null,
        badge: text.BADGE_NEEDS_DOCKER,
      };
    case "cloud":
      return {
        name: text.NAME_CLOUD,
        subtitle: text.CLOUD_SUBTITLE,
        whatHappens: [],
        caveat: null,
        warning: text.CLOUD_WARNING,
        badge: text.BADGE_FILES_LEAVE,
      };
  }
}
