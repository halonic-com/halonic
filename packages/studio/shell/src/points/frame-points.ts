import { ShellError } from "../shell-error.ts";
import type {
  BarItemContribution,
  CardContribution,
  DialogHostContribution,
  PanelWindowContribution,
  PhoneBarContribution,
  PlaceContribution,
  SettingsSectionContribution,
} from "./frame.ts";
import { sidebarPlaces } from "./frame.ts";
import { type HomeCardContribution, type HomePoint, homeSections } from "./home.ts";
import {
  byOrder,
  type Point,
  type PointGuard,
  PointStore,
  pointOn,
  type Registered,
} from "./point-store.ts";
import { bySettingsGroup, checkSettingsScope } from "./settings-sections.ts";

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
  /** Adds a view that draws the feature's dialogs; the window draws each once. */
  readonly dialogs: Point<DialogHostContribution>;
  /** Adds a settings section. Throws a `ShellError` for a `scope` that isn't one of `settingsScopes`. */
  readonly settings: Point<SettingsSectionContribution>;
  /**
   * Adds a sidebar place; the shell sets their order, name and icon. Throws a `ShellError` for an
   * unknown place, one another feature added, or Home, which the shell adds itself.
   */
  readonly places: Point<PlaceContribution>;
  /** Adds a card to Home; the shell sets their order. */
  readonly home: HomePoint;
}

/**
 * What the shell's frame reads. Every list is sorted by `order`, then `id`; settings sections by
 * their group first (`bySettingsGroup`).
 */
export interface FrameContributions {
  readonly cards: { for(selection: string): readonly Registered<CardContribution>[] };
  readonly panelWindows: { list(): readonly Registered<PanelWindowContribution>[] };
  readonly statusBar: { list(): readonly Registered<BarItemContribution>[] };
  readonly titleBar: { list(): readonly Registered<BarItemContribution>[] };
  readonly phoneBar: { list(): readonly Registered<PhoneBarContribution>[] };
  readonly dialogs: { list(): readonly Registered<DialogHostContribution>[] };
  readonly settings: { list(): readonly Registered<SettingsSectionContribution>[] };
  /** Home, which the shell adds, and the places features added, in the sidebar's fixed order. */
  readonly places: { list(): readonly Registered<PlaceContribution>[] };
  /** The cards features added to Home, in Home's fixed order. */
  readonly home: { cards(): readonly Registered<HomeCardContribution>[] };
}

/** The id the shell's own contributions carry as their `featureId`, such as the Home place. */
export const shellContributorId = "shell";

/** Home's place: the shell adds it, so Home is there before any feature registers. */
const homePlace: PlaceContribution = {
  id: "home",
  view: "HomePage",
  load: () => import("../home/home-page.tsx"),
};

/** Holds every frame contribution while features register, then serves them. */
export class FrameStores {
  private readonly cards = new PointStore<CardContribution>("cards.add", ["for", "id"]);
  private readonly panelWindows = new PointStore<PanelWindowContribution>("panelWindows.add", [
    "id",
  ]);
  private readonly statusBar = new PointStore<BarItemContribution>("statusBar.add", ["id"]);
  private readonly titleBar = new PointStore<BarItemContribution>("titleBar.add", ["id"]);
  private readonly phoneBar = new PointStore<PhoneBarContribution>("phoneBar.add", ["id"]);
  private readonly dialogs = new PointStore<DialogHostContribution>("dialogs.add", ["id"]);
  private readonly settings = new PointStore<SettingsSectionContribution>("settings.add", ["id"]);
  private readonly places = new PointStore<PlaceContribution>("places.add", ["id"]);
  private readonly homeCards = new PointStore<HomeCardContribution>("home.addCard", ["id"]);

  constructor() {
    this.places.add(shellContributorId, homePlace);
  }

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
      dialogs: pointOf("dialogs.add", this.dialogs),
      settings: {
        add: (section) => {
          guard("settings.add");
          // The store checks first that it is a plain object with a valid id, so the scope can be read.
          // A bad scope is stored before it throws, but the throw aborts `createShell`, so no shell
          // ever lists it.
          this.settings.add(featureId, section);
          checkSettingsScope(featureId, section);
        },
      },
      places: {
        add: (place) => {
          guard("places.add");
          rejectUnknownPlace(place, featureId);
          this.rejectTakenPlace(place, featureId);
          this.places.add(featureId, place);
        },
      },
      home: {
        addCard: (card) => {
          guard("home.addCard");
          rejectUnknownSection(card, featureId);
          this.rejectTakenSection(card, featureId);
          this.homeCards.add(featureId, card);
        },
      },
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
      dialogs: { list: () => byOrder(this.dialogs.all()) },
      settings: { list: () => bySettingsGroup(this.settings.all()) },
      places: {
        list: () =>
          [...this.places.all()].sort(
            (left, right) => sidebarPlaces.indexOf(left.id) - sidebarPlaces.indexOf(right.id),
          ),
      },
      home: {
        cards: () =>
          [...this.homeCards.all()].sort(
            (left, right) => homeSections.indexOf(left.id) - homeSections.indexOf(right.id),
          ),
      },
    };
  }

  /** A place can't be renamed, so the generic "rename one" message wouldn't help here. */
  private rejectTakenPlace(place: PlaceContribution, featureId: string): void {
    const existing = this.places.get(place.id);
    if (existing?.featureId === shellContributorId) {
      throw new ShellError(
        `places.add: the feature "${featureId}" adds the place "${place.id}", which the shell adds itself. Add a card to Home with home.addCard instead.`,
      );
    }
    if (existing !== undefined) {
      throw new ShellError(
        `places.add: the place "${place.id}" is added by both "${existing.featureId}" and "${featureId}". Each place belongs to one feature; add your page to that feature's view instead.`,
      );
    }
  }

  /** Like a place, a section can't be renamed, so the generic message wouldn't help. */
  private rejectTakenSection(card: HomeCardContribution, featureId: string): void {
    const existing = this.homeCards.get(card.id);
    if (existing !== undefined) {
      throw new ShellError(
        `home.addCard: the section "${card.id}" is added by both "${existing.featureId}" and "${featureId}". Each section of Home belongs to one feature.`,
      );
    }
  }
}

/** The sidebar's places are a fixed list (component specs 24.4), so a feature can't make up one. */
function rejectUnknownPlace(place: PlaceContribution, featureId: string): void {
  if (!(sidebarPlaces as readonly string[]).includes(place.id)) {
    throw new ShellError(
      `places.add: the feature "${featureId}" adds the place ${JSON.stringify(place.id)}, which isn't one of the sidebar's places (${sidebarPlaces.join(", ")}). Add a page to a place's view instead, or ask for a new place in the design.`,
    );
  }
}

/** Home's sections are a fixed list (design direction 3), so a feature can't make up one. */
function rejectUnknownSection(card: HomeCardContribution, featureId: string): void {
  if (!(homeSections as readonly string[]).includes(card.id)) {
    throw new ShellError(
      `home.addCard: the feature "${featureId}" adds the section ${JSON.stringify(card.id)}, which isn't one of Home's sections (${homeSections.join(", ")}). Show it on your own place's page instead, or ask for a new section in the design.`,
    );
  }
}
