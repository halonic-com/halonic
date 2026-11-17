import type { SandboxBackendId } from "@halonicjs/app";
import { Button, Checkbox, InfoIcon, RadioGroup } from "@halonicjs/studio-kit";
import { type ReactNode, useId, useState } from "react";
import * as text from "../sandbox-choice-text.ts";
import type { SandboxCard, SandboxChoiceView } from "../sandbox-choice-view.ts";
import { SandboxModal } from "./sandbox-modal.tsx";

/** Which screen of the choice is showing. More info and Other options are second steps, not expansions. */
export type SandboxChoiceScreen = "choose" | "more-info" | "options" | "confirm-none";

/** Props for {@link SandboxChoiceFlow}. */
export interface SandboxChoiceFlowProps {
  /** The cards, or `"checking"` while the host looks, or `"failed"` when it couldn't. */
  readonly view: SandboxChoiceView | "checking" | "failed";
  readonly platform: string;
  /** The person pressed a card's button. The host takes it from there. */
  readonly onSetUp: (backend: SandboxBackendId) => void;
  /** The person confirmed "Continue without sandbox" on S6. */
  readonly onContinueWithout: () => void;
  /** The screen to start on; for tests and screenshots. */
  readonly initialScreen?: SandboxChoiceScreen;
}

/**
 * S1 Choose, S1 More info, S2 Other options and S6 Continue without sandbox, in one modal that keeps
 * its width while the steps swap. It only shows the cards it is given and reports what the person
 * picked; it decides nothing (`settings.sandbox-choice-flow`).
 */
export function SandboxChoiceFlow({
  view,
  platform,
  onSetUp,
  onContinueWithout,
  initialScreen = "choose",
}: SandboxChoiceFlowProps) {
  const [screen, setScreenNow] = useState<SandboxChoiceScreen>(initialScreen);
  const [moved, setMoved] = useState(false);
  const setScreen = (next: SandboxChoiceScreen) => {
    setMoved(true);
    setScreenNow(next);
  };
  const windows = platform === "win32";
  const cards = typeof view === "string" ? null : view;
  if (screen === "more-info") {
    return (
      <MoreInfo
        card={cards?.recommended ?? null}
        windows={windows}
        focusTitle={moved}
        onBack={() => setScreen("choose")}
      />
    );
  }
  if (screen === "options" && cards !== null) {
    return (
      <Options
        cards={cards.options}
        focusTitle={moved}
        onSetUp={onSetUp}
        onBack={() => setScreen("choose")}
      />
    );
  }
  if (screen === "confirm-none") {
    return (
      <ConfirmNone
        focusTitle={moved}
        onSetUp={() =>
          setScreen(cards !== null && cards.recommended !== null ? "choose" : "options")
        }
        onContinue={onContinueWithout}
      />
    );
  }
  return (
    <Choose
      view={view}
      focusTitle={moved}
      onSetUp={onSetUp}
      onMore={() => setScreen("more-info")}
      onOptions={() => setScreen("options")}
      onWithout={() => setScreen("confirm-none")}
    />
  );
}

interface ChooseProps {
  readonly view: SandboxChoiceFlowProps["view"];
  readonly focusTitle: boolean;
  readonly onSetUp: (backend: SandboxBackendId) => void;
  readonly onMore: () => void;
  readonly onOptions: () => void;
  readonly onWithout: () => void;
}

function Choose({ view, focusTitle, onSetUp, onMore, onOptions, onWithout }: ChooseProps) {
  const card = typeof view === "string" ? null : view.recommended;
  let body: ReactNode = null;
  if (view === "checking") {
    body = (
      <p role="status" className="text-fg-muted">
        {text.CHECKING}
      </p>
    );
  } else if (view === "failed") {
    body = <p role="alert">{text.DETECTION_FAILED}</p>;
  } else if (card === null) {
    body = null;
  } else {
    body = <RecommendedCard card={card} onMore={onMore} />;
  }
  const hasOptions = typeof view !== "string" && view.options.length > 0;
  return (
    <SandboxModal
      step={text.STEP_LABEL}
      title={text.TITLE}
      focusTitle={focusTitle}
      footer={
        <>
          {card === null ? null : (
            <div className="flex justify-end">
              <Button variant="primary" onClick={() => onSetUp(card.id)}>
                {card.action}
              </Button>
            </div>
          )}
          <div className="flex w-full items-center justify-between">
            {hasOptions ? (
              <Button variant="ghost" size="sm" onClick={onOptions}>
                {text.OTHER_OPTIONS}
              </Button>
            ) : (
              <span />
            )}
            {card === null ? null : (
              <Button variant="ghost" size="sm" onClick={onMore}>
                {text.MORE_INFO}
              </Button>
            )}
          </div>
          <div>
            <Button variant="ghost" size="sm" onClick={onWithout}>
              {text.CONTINUE_WITHOUT}
            </Button>
          </div>
        </>
      }
    >
      <p>{text.INTRO}</p>
      {body}
    </SandboxModal>
  );
}

interface RecommendedProps {
  readonly card: SandboxCard;
  readonly onMore: () => void;
}

function RecommendedCard({ card, onMore }: RecommendedProps) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-surface-subtle p-4">
      {card.badge === null ? null : (
        <p className="text-small text-fg-muted">
          <span aria-hidden="true">★ </span>
          {card.badge}
        </p>
      )}
      <h3 className="text-section">{card.name}</h3>
      <p className="text-small text-fg-muted">{card.subtitle}</p>
      {card.whatHappens.length === 0 ? null : (
        <>
          <p className="text-small text-fg-muted">{text.WHAT_HAPPENS_LEAD}</p>
          <ul className="flex flex-col gap-1">
            {card.whatHappens.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </>
      )}
      {card.caveat === null ? null : (
        <p className="flex items-center gap-1 text-small">
          {card.caveat}
          <Button variant="ghost" size="sm" onClick={onMore} icon={<InfoIcon />}>
            {text.WHY}
          </Button>
        </p>
      )}
    </div>
  );
}

function MoreInfo({
  card,
  windows,
  focusTitle,
  onBack,
}: {
  readonly card: SandboxCard | null;
  readonly windows: boolean;
  readonly focusTitle: boolean;
  readonly onBack: () => void;
}) {
  const wsl = card?.id === "srt-wsl";
  const covers = windows && !wsl ? text.MORE_COVERS_WINDOWS : text.MORE_COVERS;
  const others = windows ? text.MORE_OTHERS_WINDOWS : text.MORE_OTHERS;
  return (
    <SandboxModal
      step={text.STEP_LABEL}
      title={text.MORE_INFO}
      focusTitle={focusTitle}
      footer={
        <div>
          <Button variant="ghost" size="sm" onClick={onBack}>
            {text.BACK}
          </Button>
        </div>
      }
    >
      <Block title={text.MORE_WHAT_TITLE}>
        <p>{text.MORE_WHAT}</p>
      </Block>
      <Block title={text.MORE_COVERS_TITLE}>
        <Lines lines={covers} />
      </Block>
      {windows ? (
        <Block title={text.MORE_WSL_TITLE}>
          <p>{text.MORE_WSL}</p>
        </Block>
      ) : null}
      <Block title={text.MORE_OTHERS_TITLE}>
        <Lines lines={others} />
      </Block>
    </SandboxModal>
  );
}

function Block({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-small font-semibold">{title}</h3>
      {children}
    </div>
  );
}

function Lines({ lines }: { readonly lines: readonly string[] }) {
  return (
    <ul className="flex flex-col gap-1 text-small">
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}

interface OptionsProps {
  readonly cards: readonly SandboxCard[];
  readonly focusTitle: boolean;
  readonly onSetUp: (backend: SandboxBackendId) => void;
  readonly onBack: () => void;
}

function Options({ cards, focusTitle, onSetUp, onBack }: OptionsProps) {
  const first = cards.find((card) => card.use !== "disabled" && card.id !== "cloud");
  const [picked, setPicked] = useState<SandboxBackendId | null>(first?.id ?? null);
  const [confirmed, setConfirmed] = useState(false);
  const card = cards.find((one) => one.id === picked) ?? null;
  const needsBox = card?.needsConfirmation === true;
  const blockedReason = useId();
  return (
    <SandboxModal
      step={text.STEP_LABEL}
      title={text.OTHER_OPTIONS_TITLE}
      focusTitle={focusTitle}
      footer={
        <>
          {/* The view gives every card that needs a box its label, so the box is always there. */}
          {needsBox && card?.confirmation != null ? (
            <Checkbox checked={confirmed} onChange={setConfirmed}>
              {card.confirmation}
            </Checkbox>
          ) : null}
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={onBack}>
              {text.BACK}
            </Button>
            <Button
              variant="primary"
              {...(card === null || (needsBox && !confirmed)
                ? { unavailable: { reason: blockedReason } }
                : {})}
              onClick={() => card !== null && onSetUp(card.id)}
            >
              {card === null ? text.SET_UP : text.setUpWith(card.name)}
            </Button>
          </div>
          <span id={blockedReason} className="sr-only">
            {card === null ? text.PICK_ONE : (card.confirmation ?? "")}
          </span>
        </>
      }
    >
      <p>{text.OTHER_OPTIONS_INTRO}</p>
      <RadioGroup<SandboxBackendId>
        label={text.OTHER_OPTIONS_TITLE}
        value={picked}
        onChange={(id) => {
          setPicked(id);
          setConfirmed(false);
        }}
        options={cards.map((one) => ({
          value: one.id,
          label: (
            <>
              {one.name}
              {one.badge === null ? null : (
                <span className="ml-2 text-small text-fg-muted">{one.badge}</span>
              )}
            </>
          ),
          note: one.disabledReason ?? one.subtitle,
          ...(one.use === "disabled" ? { unavailable: true as const } : {}),
        }))}
      />
      {card?.warning == null ? null : (
        <p className="text-small" role="note">
          {card.warning}
        </p>
      )}
      {card?.caveat == null ? null : (
        <p className="text-small" role="note">
          {card.caveat}
        </p>
      )}
    </SandboxModal>
  );
}

function ConfirmNone({
  focusTitle,
  onSetUp,
  onContinue,
}: {
  readonly focusTitle: boolean;
  readonly onSetUp: () => void;
  readonly onContinue: () => void;
}) {
  return (
    <SandboxModal
      title={text.CONFIRM_TITLE}
      focusTitle={focusTitle}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={onContinue}>
            {text.CONTINUE_WITHOUT}
          </Button>
          <Button variant="primary" onClick={onSetUp}>
            {text.SET_UP_A_SANDBOX}
          </Button>
        </div>
      }
    >
      {text.CONFIRM_BODY.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
    </SandboxModal>
  );
}
