import { Button, ChevronRightIcon, Dialog } from "@halonicjs/studio-kit";
import { agentsAsOfText, asOfText, secondsText } from "./phone-forms.ts";
import { sheetRouteWords, sheetWords } from "./status-words.ts";

/**
 * Which detail sheet the header label opens (`s-m4`, `s-m5`, `s-m6`, `s-m8`). Removed and Can't
 * confirm have no sheet: their label moves to the screen's heading. The page picks the trouble
 * sheet: `tailscaleOff` (G17) and `nearbyOff` (G24) are the phone's own causes, which the header
 * still shows as "Your phone is offline" and "Can't reach your computer".
 */
export type StatusSheetOf =
  | { readonly kind: "connected"; readonly route: keyof typeof sheetRouteWords }
  /** `nextTryAt` from the tunnel's status; none, or one that has passed, is a try under way (G14). */
  | { readonly kind: "reconnecting"; readonly nextTryAt?: Date | undefined }
  /** `route` picks the check line: Tailscale on there, or both on the same Wi-Fi (C660). */
  | { readonly kind: "unreachable"; readonly route: keyof typeof sheetRouteWords }
  | { readonly kind: "phoneOffline" | "tailscaleOff" | "nearbyOff" };

type TroubleKind = "unreachable" | "phoneOffline" | "tailscaleOff" | "nearbyOff";

/** What the page does for a sheet's buttons. */
export interface StatusSheetActions {
  /** Try again, Try now: connect at once. */
  readonly onTryAgain: () => void;
  /** Open settings (G24): Android's settings for Halonic. */
  readonly onOpenSettings: () => void;
  /** Open Tailscale (G17). */
  readonly onOpenTailscale: () => void;
  /** The Connected sheet's Paired computers row (`d-m1`). */
  readonly onOpenComputers: () => void;
  /** The ✕, Escape and Android back. The page unmounts the sheet. */
  readonly onClose: () => void;
}

export interface StatusSheetProps extends StatusSheetActions {
  readonly sheet: StatusSheetOf;
  /** The computer's own name: "Tim's laptop". */
  readonly computer: string;
  /**
   * When the last session list or event arrived, by the phone's clock (`RemoteView.asOf`).
   * Without it nothing has arrived since the app started, so the sheet says no "Last update" and
   * shows no Your agents card.
   */
  readonly asOf: Date | undefined;
  /** Running and waiting agents as of `asOf`, for the trouble sheets' Your agents card. */
  readonly agents?: { readonly running: number; readonly waiting: number } | undefined;
  /** The phone's clock. The page renders again each second while Reconnecting counts down. */
  readonly now: Date;
}

/** The trouble sheets' words and their one button, primary where the person can act on it here. */
const trouble: Record<
  TroubleKind,
  {
    readonly words: {
      readonly title: string;
      readonly phone: (computer: string) => string;
      readonly check: string | ((computer: string) => string);
    };
    readonly button: "tryAgain" | "openTailscale" | "openSettings";
    readonly primary: boolean;
  }
> = {
  unreachable: { words: sheetWords.unreachable, button: "tryAgain", primary: true },
  phoneOffline: { words: sheetWords.phoneOffline, button: "tryAgain", primary: false },
  tailscaleOff: { words: sheetWords.tailscaleOff, button: "openTailscale", primary: true },
  nearbyOff: { words: sheetWords.nearbyOff, button: "openSettings", primary: true },
};

/** The sheet's title, which also names its dialog. */
export function statusSheetTitle(sheet: StatusSheetOf): string {
  if (sheet.kind === "connected" || sheet.kind === "reconnecting") {
    return sheetWords[sheet.kind].title;
  }
  return trouble[sheet.kind].words.title;
}

const card = "flex flex-col gap-1 rounded-md border border-border px-4 py-3";
const cardLabel = "text-label uppercase text-fg-muted";
const small = "text-small text-fg-muted";

/**
 * The detail sheet the phone's header label opens: what the phone knows of its own side, and for
 * the trouble states what the agents were last doing (design section 3, "two honest halves").
 * It's the kit's footerless Dialog, focus on its title, so TalkBack reads the title first; the
 * state change itself was already said by the header's live region.
 */
export function StatusSheet(props: StatusSheetProps) {
  const { sheet, asOf, now } = props;
  const asOfWords = asOf === undefined ? undefined : asOfText(asOf, now);
  return (
    <Dialog title={statusSheetTitle(sheet)} size="sm" focusTitle onCancel={props.onClose}>
      <div className="flex flex-col gap-4">{sheetBody(props, asOfWords)}</div>
    </Dialog>
  );
}

function sheetBody(props: StatusSheetProps, asOfWords: string | undefined) {
  const { sheet, computer, now } = props;
  switch (sheet.kind) {
    case "connected":
      return (
        <ConnectedBody {...props} route={sheetRouteWords[sheet.route]} asOfWords={asOfWords} />
      );
    case "reconnecting":
      return (
        <>
          <p className="text-body text-fg">
            {sheet.nextTryAt === undefined || sheet.nextTryAt <= now
              ? sheetWords.reconnecting.bodyTrying(computer)
              : sheetWords.reconnecting.body(
                  computer,
                  secondsText(sheet.nextTryAt.getTime() - now.getTime()),
                )}
          </p>
          {asOfWords === undefined ? null : (
            <p className={small}>{sheetWords.reconnecting.stale(asOfWords)}</p>
          )}
          <Button size="touch" block onClick={props.onTryAgain}>
            {sheetWords.reconnecting.tryNow}
          </Button>
        </>
      );
    default:
      return (
        <TroubleBody
          {...props}
          kind={sheet.kind}
          check={
            sheet.kind === "unreachable" && sheet.route === "wifi"
              ? sheetWords.unreachable.checkWifi
              : trouble[sheet.kind].words.check
          }
          asOfWords={asOfWords}
        />
      );
  }
}

function ConnectedBody({
  computer,
  route,
  asOfWords,
  onOpenComputers,
}: StatusSheetProps & { readonly route: string; readonly asOfWords: string | undefined }) {
  const body = sheetWords.connected.body(computer, route);
  return (
    <>
      <p className="text-body text-fg">
        {asOfWords === undefined ? body : `${body} ${sheetWords.connected.lastUpdate(asOfWords)}`}
      </p>
      <button
        type="button"
        className="-mx-1 flex min-h-touch items-center gap-3 border-t border-border px-1 text-left text-body text-fg focus-ring"
        onClick={onOpenComputers}
      >
        <span className="flex-1">{sheetWords.connected.computers}</span>
        <span className="size-icon-md shrink-0 text-fg-subtle *:size-full" aria-hidden="true">
          <ChevronRightIcon />
        </span>
      </button>
    </>
  );
}

function TroubleBody(
  props: StatusSheetProps & {
    readonly kind: TroubleKind;
    readonly check: string | ((computer: string) => string);
    readonly asOfWords: string | undefined;
  },
) {
  const { words, button, primary } = trouble[props.kind];
  const { agents, asOfWords, check, computer } = props;
  const onClick = {
    tryAgain: props.onTryAgain,
    openTailscale: props.onOpenTailscale,
    openSettings: props.onOpenSettings,
  }[button];
  return (
    <>
      <section className={card} aria-label={sheetWords.yourPhone}>
        <p className={cardLabel} aria-hidden="true">
          {sheetWords.yourPhone}
        </p>
        <p className="text-body text-fg">{words.phone(computer)}</p>
      </section>
      {asOfWords === undefined || agents === undefined ? null : (
        <section className={card} aria-label={sheetWords.yourAgents(asOfWords)}>
          <p className={cardLabel} aria-hidden="true">
            {sheetWords.yourAgents(asOfWords)}
          </p>
          <p className="text-body text-fg">{agentsAsOfText(agents.running, agents.waiting)}</p>
        </section>
      )}
      <p className={small}>{typeof check === "string" ? check : check(computer)}</p>
      <Button variant={primary ? "primary" : "secondary"} size="touch" block onClick={onClick}>
        {sheetWords[button]}
      </Button>
    </>
  );
}
