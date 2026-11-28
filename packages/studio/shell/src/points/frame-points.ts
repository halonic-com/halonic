import { ShellError } from "../shell-error.ts";
import type {
  BarItemContribution,
  CardContribution,
  DialogHostContribution,
  FocusedAppContribution,
  HelpContribution,
  PanelWindowContribution,
  PhoneBarContribution,
  PlaceContribution,
  SettingsSectionContribution,
  SidebarViewContribution,
  StripContribution,
} from "./frame.ts";
import { focusedAppIds, sidebarPlaces } from "./frame.ts";
import {
  type HomeCardContribution,
  type HomePoint,
  type HomeViewContribution,
  homeSections,
} from "./home.ts";
import {
  byOrder,
  type Point,
  type PointGuard,
  PointStore,
  pointOn,
  type Registered,
} from "./point-store.ts";
import type { RailEntryContribution } from "./rail.ts";
import { type RailContributions, RailStore } from "./rail-points.ts";
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
  /**
   * Sets the one item at the sidebar's bottom left, such as the account switcher. Throws a
   * `ShellError` when another feature already set one: the sidebar has room for one, and the shell
   * won't pick between two.
   */
  readonly sidebarFooter: Point<BarItemContribution>;
  readonly phoneBar: Point<PhoneBarContribution>;
  /** Adds a strip under the top bar, such as the first-run bar. */
  readonly strips: Point<StripContribution>;
  /** Adds a group of items to the sidebar's Help menu. */
  readonly help: Point<HelpContribution>;
  /** Adds a view that draws the feature's dialogs; the window draws each once. */
  readonly dialogs: Point<DialogHostContribution>;
  /** Adds a settings section. Throws a `ShellError` for a `scope` that isn't one of `settingsScopes`. */
  readonly settings: Point<SettingsSectionContribution>;
  /**
   * Adds a sidebar place; the shell sets their order, name and icon. Throws a `ShellError` for an
   * unknown place, one another feature added, or Home, which the shell adds itself.
   */
  readonly places: Point<PlaceContribution>;
  /**
   * Adds the feature's entry to the icon rail, with its order and the rule that says when it
   * shows. Throws a `ShellError` for an unknown entry, one another feature added, Home or Settings,
   * which the shell adds itself, or an empty label.
   */
  readonly rail: Point<RailEntryContribution>;
  /** Adds a card to Home; the shell sets their order. */
  readonly home: HomePoint;
  /**
   * Adds a view to the sidebar's Studio switch, such as the file tree. Throws a `ShellError` for a
   * `label` that is empty.
   */
  readonly sidebarViews: Point<SidebarViewContribution>;
  /**
   * Adds the feature's focused app, the view its own window shows. Throws a `ShellError` for an id
   * that isn't one of `focusedAppIds`, or one another feature added.
   */
  readonly focusedApps: Point<FocusedAppContribution>;
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
  /** The item at the sidebar's bottom left, or `undefined` while no feature sets one. */
  readonly sidebarFooter: { item(): Registered<BarItemContribution> | undefined };
  readonly phoneBar: { list(): readonly Registered<PhoneBarContribution>[] };
  readonly strips: { list(): readonly Registered<StripContribution>[] };
  readonly help: { list(): readonly Registered<HelpContribution>[] };
  readonly dialogs: { list(): readonly Registered<DialogHostContribution>[] };
  readonly settings: { list(): readonly Registered<SettingsSectionContribution>[] };
  /** Home, which the shell adds, and the places features added, in the sidebar's fixed order. */
  readonly places: { list(): readonly Registered<PlaceContribution>[] };
  /** The icon rail's entries a folder shows. */
  readonly rail: RailContributions;
  /** The cards features added to Home, in Home's fixed order. */
  readonly home: {
    cards(): readonly Registered<HomeCardContribution>[];
    /** Home's list column and content pane, or `undefined` while no feature set them. */
    view(): Registered<HomeViewContribution> | undefined;
  };
  /** The views features added next to the Studio's places, by `order`, then `id`; none while no feature adds one. */
  readonly sidebarViews: { list(): readonly Registered<SidebarViewContribution>[] };
  /** The focused apps features added; a focused app's window shows the one its label names. */
  readonly focusedApps: { list(): readonly Registered<FocusedAppContribution>[] };
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
  private readonly sidebarFooter = new PointStore<BarItemContribution>("sidebarFooter.add", ["id"]);
  private readonly phoneBar = new PointStore<PhoneBarContribution>("phoneBar.add", ["id"]);
  private readonly strips = new PointStore<StripContribution>("strips.add", ["id"]);
  private readonly help = new PointStore<HelpContribution>("help.add", ["id"]);
  private readonly dialogs = new PointStore<DialogHostContribution>("dialogs.add", ["id"]);
  private readonly settings = new PointStore<SettingsSectionContribution>("settings.add", ["id"]);
  private readonly places = new PointStore<PlaceContribution>("places.add", ["id"]);
  private readonly rail = new RailStore();
  private readonly sidebarViews = new PointStore<SidebarViewContribution>("sidebarViews.add", [
    "id",
  ]);
  private readonly homeCards = new PointStore<HomeCardContribution>("home.addCard", ["id"]);
  private readonly focusedApps = new PointStore<FocusedAppContribution>("focusedApps.add", ["id"]);
  private homeView: Registered<HomeViewContribution> | undefined;

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
      sidebarFooter: {
        add: (item) => {
          guard("sidebarFooter.add");
          this.rejectTakenFooter(featureId);
          this.sidebarFooter.add(featureId, item);
        },
      },
      phoneBar: pointOf("phoneBar.add", this.phoneBar),
      strips: pointOf("strips.add", this.strips),
      help: pointOf("help.add", this.help),
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
      rail: this.rail.pointFor(featureId, guard),
      sidebarViews: {
        add: (view) => {
          guard("sidebarViews.add");
          this.sidebarViews.add(featureId, view);
          checkViewLabel(featureId, view);
        },
      },
      focusedApps: {
        add: (app) => {
          guard("focusedApps.add");
          rejectUnknownFocusedApp(app, featureId);
          this.focusedApps.add(featureId, app);
        },
      },
      home: {
        addCard: (card) => {
          guard("home.addCard");
          rejectUnknownSection(card, featureId);
          this.rejectTakenSection(card, featureId);
          this.homeCards.add(featureId, card);
        },
        setView: (view) => {
          guard("home.setView");
          this.rejectTakenView(featureId);
          this.homeView = Object.freeze({ ...view, featureId });
        },
      },
    };
  }

  /** Checks what only makes sense once every feature has registered, such as the rail's places. */
  check(placeOfKind: (kind: string) => string | undefined): void {
    this.rail.check(placeOfKind);
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
      sidebarFooter: { item: () => this.sidebarFooter.all()[0] },
      phoneBar: { list: () => byOrder(this.phoneBar.all()) },
      strips: { list: () => byOrder(this.strips.all()) },
      help: { list: () => byOrder(this.help.all()) },
      dialogs: { list: () => byOrder(this.dialogs.all()) },
      settings: { list: () => bySettingsGroup(this.settings.all()) },
      places: {
        list: () =>
          [...this.places.all()].sort(
            (left, right) => sidebarPlaces.indexOf(left.id) - sidebarPlaces.indexOf(right.id),
          ),
      },
      rail: this.rail.contributions(),
      sidebarViews: { list: () => byOrder(this.sidebarViews.all()) },
      focusedApps: { list: () => this.focusedApps.all() },
      home: {
        cards: () =>
          [...this.homeCards.all()].sort(
            (left, right) => homeSections.indexOf(left.id) - homeSections.indexOf(right.id),
          ),
        view: () => this.homeView,
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

  /** The footer holds one item, so a second is an error rather than a quiet pick. */
  private rejectTakenFooter(featureId: string): void {
    const existing = this.sidebarFooter.all()[0];
    if (existing !== undefined) {
      throw new ShellError(
        `sidebarFooter.add: the sidebar's footer has room for one item, and "${existing.featureId}" already set it, so "${featureId}" can't. Put the item in that feature's view, or in the title bar with titleBar.add.`,
      );
    }
  }

  /** Home has one view, so a second is an error rather than a quiet pick. */
  private rejectTakenView(featureId: string): void {
    if (this.homeView !== undefined) {
      throw new ShellError(
        `home.setView: Home's view is set by both "${this.homeView.featureId}" and "${featureId}". Home has one view; add a card with home.addCard instead.`,
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

/** The desktop shell opens only the focused apps it names, so a feature can't make up one. */
function rejectUnknownFocusedApp(app: FocusedAppContribution, featureId: string): void {
  if (!(focusedAppIds as readonly string[]).includes(app.id)) {
    throw new ShellError(
      `focusedApps.add: the feature "${featureId}" adds the focused app ${JSON.stringify(app.id)}, which isn't one of the apps Halonic starts (${focusedAppIds.join(", ")}). Add it to the desktop shell's apps first.`,
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

/** The switch names the view by its label, so a view without one would be a button with no name. */
function checkViewLabel(featureId: string, view: SidebarViewContribution): void {
  if (typeof view.label !== "string" || view.label.trim() === "") {
    throw new ShellError(
      `sidebarViews.add: the feature "${featureId}" gives the view "${view.id}" no label. Give it the name the sidebar's switch shows, such as "Files".`,
    );
  }
}
