import type { PluginActionsClient, PluginDataClient } from "@paperclipai/plugin-sdk";
import { manualResetActionKey, seatsPageDataKey } from "./bridge-keys.ts";
import { recordManualReset, type SeatsRouteDeps, seatsPageData } from "./routes.ts";

/** The part of the plugin context the page's bridge uses, so tests can fake it. */
export interface SeatsBridgeApi {
  readonly data: Pick<PluginDataClient, "register">;
  readonly actions: Pick<PluginActionsClient, "register">;
}

/**
 * What the "AI seats" page calls in the worker: the page's data and
 * recording a manual reset, the same as the board-only routes give.
 *
 * Paperclip lets only board users with access to the company ask for data
 * (`assertBoardOrgAccess`), and it hands the company it checked. Actions are
 * different: Paperclip lets agents call them too, so the reset checks the
 * caller itself and refuses anyone who isn't a signed-in user, and it takes
 * the company only from what Paperclip checked, never from the page.
 */
export function registerSeatsBridge(ctx: SeatsBridgeApi, deps: SeatsRouteDeps): void {
  ctx.data.register(seatsPageDataKey, async (params) => {
    const companyId = params["companyId"];
    if (typeof companyId !== "string" || companyId === "") {
      throw new Error("The AI seats page needs a company.");
    }
    return await seatsPageData(companyId, await deps.readSettings(companyId), deps);
  });
  ctx.actions.register(manualResetActionKey, async (params, context) => {
    const { actor } = context;
    if (actor.type !== "user" || actor.userId === null) {
      throw new Error("Only the board can record a manual reset.");
    }
    if (context.companyId === null) {
      throw new Error("Recording a manual reset needs a company.");
    }
    const seatId = typeof params["seatId"] === "string" ? params["seatId"] : undefined;
    const settings = await deps.readSettings(context.companyId);
    const result = await recordManualReset(seatId, actor.userId, settings, deps);
    if ((result.status ?? 200) >= 400) {
      throw new Error(refusal(result.body));
    }
    return result.body;
  });
}

function refusal(body: unknown): string {
  const error = (body as { error?: unknown } | undefined)?.error;
  return typeof error === "string" ? error : "The manual reset was refused.";
}
