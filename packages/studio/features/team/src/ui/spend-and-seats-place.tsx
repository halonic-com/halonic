import type { PlaceViewProps } from "@halonicjs/studio-shell";
import { SpendAndSeatsService, TeamDetailsService } from "../api.ts";
import { SpendAndSeatsPage } from "./spend-and-seats-page.tsx";

/**
 * The Spend and seats place under the sidebar's Team group: the screen with
 * this workspace's reads. Nothing in Studio opens Paperclip pages yet, so it
 * gets no `onLink` and draws no link buttons rather than ones that do nothing.
 */
export function SpendAndSeatsPlace({ context }: PlaceViewProps) {
  return (
    <SpendAndSeatsPage
      spendAndSeats={context.services.get(SpendAndSeatsService)}
      details={context.services.get(TeamDetailsService)}
    />
  );
}
