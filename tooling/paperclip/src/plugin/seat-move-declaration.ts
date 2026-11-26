import type { PluginApiRouteDeclaration, PluginJobDeclaration } from "@paperclipai/plugin-sdk";
import { defaultSeatMoverSettings as d } from "../seat-mover/settings.ts";

/**
 * The seat mover's job and settings in the manifest (HAL-19354,
 * src/plugin/seat-move-job.ts). Kept here so `manifest.ts` stays within the
 * file-size limit.
 */

/** The `seat-move` job. */
export const seatMoveJob: PluginJobDeclaration = {
  jobKey: "seat-move",
  displayName: "Seat mover",
  description:
    "Every minute, unless it is off: reads the seat readings plugin, where each agent sits and the runs parked for a seat, and moves agents off full seats to seats that pass the board's checklist (shadow: only logs and comments what it would do).",
  schedule: "* * * * *",
};

/**
 * The "seat was reset" route's key. It lives here, not in `seat-reset-route.ts`,
 * so the manifest doesn't bundle the route's code (`reviewer-paths-manifest.ts`).
 */
export const seatResetRouteKey = "seat-reset";

/** "Seat was reset", board only (HAL-19490, src/plugin/seat-reset-route.ts). */
export const seatResetRoute: PluginApiRouteDeclaration = {
  routeKey: seatResetRouteKey,
  method: "POST",
  path: "/seat-mover/seat-reset",
  auth: "board",
  capability: "api.routes.register",
  companyResolution: { from: "query", key: "companyId" },
};

const list = (title: string, description: string, fallback: readonly string[]) => ({
  type: "array",
  title,
  description,
  items: { type: "string" },
  default: [...fallback],
});

const percent = (title: string, description: string, fallback: number) => ({
  type: "number",
  minimum: 1,
  maximum: 100,
  title,
  description,
  default: fallback,
});

/** The seat mover's settings, under `seatMover`. */
export const seatMoverConfigProperties = {
  seatMover: {
    type: "object",
    title: "Seat mover",
    properties: {
      mode: {
        type: "string",
        enum: ["off", "shadow", "act"],
        title: "Mode",
        description:
          "off: reads nothing. shadow: plans each minute, logs and comments the plan on the log task when it changes, moves nobody. act: moves agents (the same PATCH of runtimeConfig the Seat Keeper sends) and releases runs left parked on seats they left. Needs Paperclip API and a board key in Paperclip API key.",
        default: d.mode,
      },
      reviewers: list(
        "Reviewers",
        "Url keys of the reviewers. A reviewer never shares a seat with another reviewer, a running heavy agent or a never-move agent. It takes an empty seat when one has room, else a seat of light agents; nobody joins a reviewer's seat.",
        d.reviewers,
      ),
      heavy: list(
        "Heavy agents",
        "Url keys of the heavy agents; at most the number below share a seat. Everyone else is light and may share.",
        d.heavy,
      ),
      maxHeavyPerSeat: {
        type: "integer",
        minimum: 1,
        title: "Heavy agents per seat",
        default: d.maxHeavyPerSeat,
      },
      fastBurners: list(
        "Fast burners",
        "Url keys of the agents that burn a seat fastest. They pick a seat right after the reviewers and sit on a reserve seat (past the weekly stop) only when its weekly reset is less than the hours below away.",
        d.fastBurners,
      ),
      pinned: list("Never move", "Url keys of agents the mover never moves.", d.pinned),
      resetFill: list(
        "Reset-fill seats",
        "Seat names (as in the readings) the board is draining to the weekly limit: the weekly stop doesn't apply to them.",
        d.resetFill,
      ),
      excludedSeats: list(
        "Excluded seats",
        "Seat names (as in the readings) or connection ids no agent is ever placed on. Add the board's own seat.",
        d.excludedSeats,
      ),
      sessionMovePercent: percent(
        "5-hour stop",
        "Agents move off, and never onto, a seat at this much of its 5-hour window.",
        d.sessionMovePercent,
      ),
      reviewerSessionMovePercent: percent(
        "5-hour stop for reviewers",
        "The same for a reviewer, who moves earlier (HAL-19202).",
        d.reviewerSessionMovePercent,
      ),
      targetHeadroomPercent: percent(
        "Room kept per moved agent",
        "A seat takes a moved agent only while its 5-hour reading plus this much for that agent, and for each agent already sent there this pass, stays below the stop. Keeps the next reading from moving them off again.",
        d.targetHeadroomPercent,
      ),
      quotaFullMinutes: {
        type: "integer",
        minimum: 1,
        title: "Full after a quota failure (minutes)",
        description:
          "A seat a run failed on with provider_quota this recently is full, whatever its reading says, until the 5-hour reset its reading reports.",
        default: d.quotaFullMinutes,
      },
      weekMovePercent: percent(
        "Weekly stop",
        "A seat at this much of its week is a reserve seat: only agents that aren't fast burners sit there, unless its weekly reset is less than the hours below away. Reset-fill seats take anyone.",
        d.weekMovePercent,
      ),
      resetSoonHours: {
        type: "number",
        minimum: 1,
        title: "Weekly reset soon (hours)",
        default: d.resetSoonHours,
      },
      weekHardStopPercent: percent(
        "Weekly hard stop",
        "Nobody sits on a seat at this much of its week (reset-fill seats excepted).",
        d.weekHardStopPercent,
      ),
      moveCooldownMinutes: {
        type: "integer",
        minimum: 1,
        title: "Time between moves (minutes)",
        description:
          "An agent the mover moved this recently moves again only when it is parked or its seat is full, not for who it sits with.",
        default: d.moveCooldownMinutes,
      },
      readingMaxAgeMinutes: {
        type: "integer",
        minimum: 5,
        title: "Oldest usable reading (minutes)",
        description: "An older reading counts as unknown: nobody is moved onto that seat.",
        default: d.readingMaxAgeMinutes,
      },
      readingsPlugin: {
        type: "string",
        title: "Seat readings plugin",
        description:
          "The key or id of the plugin whose `seats` data holds each seat's name, connection and newest usage reading. Empty: the seat mover reads nothing.",
      },
      logTask: {
        type: "string",
        title: "Log task",
        description:
          "The id of the task each batch of moves is logged on, one comment per batch (HAL-16116). Empty: only the plugin log.",
      },
      boardTask: {
        type: "string",
        title: "Board task",
        description:
          "The id of the task told once when an agent must move and no seat may take it. Empty: the log task.",
      },
    },
  },
};
