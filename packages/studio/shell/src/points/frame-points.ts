import type {
  BarItemContribution,
  CardContribution,
  PanelWindowContribution,
  PhoneBarContribution,
  SettingsSectionContribution,
} from "./frame.ts";
import {
  byOrder,
  type Point,
  type PointGuard,
  PointStore,
  pointOn,
  type Registered,
} from "./point-store.ts";

/**
 * The points for the window frame around the item pages: cards, panel
 * windows, the three bars and the settings container. Each throws a
 * `ShellError` on a duplicate id.
 */
export interface FramePoints {
  readonly cards: Point<CardContribution>;
  readonly panelWindows: Point<PanelWindowContribution>;
  readonly statusBar: Point<BarItemContribution>;
  readonly titleBar: Point<BarItemContribution>;
  readonly phoneBar: Point<PhoneBarContribution>;
  readonly settings: Point<SettingsSectionContribution>;
}

/** What the shell's frame reads. Every list is sorted by `order`, then `id`. */
export interface FrameContributions {
  readonly cards: { for(selection: string): readonly Registered<CardContribution>[] };
  readonly panelWindows: { list(): readonly Registered<PanelWindowContribution>[] };
  readonly statusBar: { list(): readonly Registered<BarItemContribution>[] };
  readonly titleBar: { list(): readonly Registered<BarItemContribution>[] };
  readonly phoneBar: { list(): readonly Registered<PhoneBarContribution>[] };
  readonly settings: { list(): readonly Registered<SettingsSectionContribution>[] };
}

/** Holds every frame contribution while features register, then serves them. */
export class FrameStores {
  private readonly cards = new PointStore<CardContribution>("cards.add", ["for", "id"]);
  private readonly panelWindows = new PointStore<PanelWindowContribution>("panelWindows.add", [
    "id",
  ]);
  private readonly statusBar = new PointStore<BarItemContribution>("statusBar.add", ["id"]);
  private readonly titleBar = new PointStore<BarItemContribution>("titleBar.add", ["id"]);
  private readonly phoneBar = new PointStore<PhoneBarContribution>("phoneBar.add", ["id"]);
  private readonly settings = new PointStore<SettingsSectionContribution>("settings.add", ["id"]);

  /** The frame points for one feature. */
  pointsFor(featureId: string, guard: PointGuard): FramePoints {
    const pointOf = <Contribution>(name: string, store: PointStore<Contribution>) =>
      pointOn(name, store, featureId, guard);
    return {
      cards: pointOf("cards.add", this.cards),
      panelWindows: pointOf("panelWindows.add", this.panelWindows),
      statusBar: pointOf("statusBar.add", this.statusBar),
      titleBar: pointOf("titleBar.add", this.titleBar),
      phoneBar: pointOf("phoneBar.add", this.phoneBar),
      settings: pointOf("settings.add", this.settings),
    };
  }

  /** The read side, for the shell's frame. */
  contributions(): FrameContributions {
    return {
      cards: {
        for: (selection) => byOrder(this.cards.all().filter((card) => card.for === selection)),
      },
      panelWindows: { list: () => byOrder(this.panelWindows.all()) },
      statusBar: { list: () => byOrder(this.statusBar.all()) },
      titleBar: { list: () => byOrder(this.titleBar.all()) },
      phoneBar: { list: () => byOrder(this.phoneBar.all()) },
      settings: { list: () => byOrder(this.settings.all()) },
    };
  }
}
