import type { HostSetting, HostSettings } from "@halonicjs/app";
import { HostSettingsService } from "@halonicjs/studio-feature-settings/api";
import { Field, Input, isComposing, settleOnClose } from "@halonicjs/studio-kit";
import type { SettingsSectionProps } from "@halonicjs/studio-shell";
import { useEffect, useRef, useState } from "react";
import { type FeedbackSettingsHost, FeedbackSettingsService } from "../api.ts";
import { feedbackPrefs, maxNameLength } from "../feedback-prefs.ts";
import { savedValue } from "./keyboard-section.tsx";
import { notSavedLine, settingsWords, waitingLine } from "./settings-words.ts";

/** Settings → Feedback as the settings container shows it, in Studio's own main window. */
export function FeedbackSection({ context }: SettingsSectionProps) {
  const host = context.services.find(FeedbackSettingsService);
  const settings = context.services.find(HostSettingsService);
  if (host === undefined || settings === undefined) return null;
  return (
    <FeedbackView
      host={host}
      settings={settings}
      announce={(line) => context.announcer.announce(line)}
    />
  );
}

/** The props of {@link FeedbackView}. */
export interface FeedbackViewProps {
  readonly host: FeedbackSettingsHost;
  readonly settings: HostSettings;
  /** Says a failed save in the dialog: the settings container's live region. */
  readonly announce: (line: string) => void;
}

/**
 * Settings → Feedback (`feedback.settings-section`): **Project** and **Assign to**, each saved
 * when the person leaves it, and "{n} waiting to send" while feedback waits to be sent. An emptied
 * field goes back to its default, Halonic apps or Chief.
 */
export function FeedbackView({ host, settings, announce }: FeedbackViewProps) {
  const waiting = useWaiting(host);
  return (
    <div className="flex max-w-90 flex-col gap-4">
      <NameField
        label={settingsWords.project}
        settings={settings}
        setting={feedbackPrefs.project}
        announce={announce}
      />
      <NameField
        label={settingsWords.assignTo}
        settings={settings}
        setting={feedbackPrefs.assignee}
        announce={announce}
      />
      {waiting > 0 ? <p className="text-small text-fg-muted">{waitingLine(waiting)}</p> : null}
    </div>
  );
}

/** How many feedbacks wait, read once when the section opens; 0 where the app can't say. */
function useWaiting(host: FeedbackSettingsHost): number {
  const [waiting, setWaiting] = useState(0);
  useEffect(() => {
    if (host.waiting === undefined) return;
    let shown = true;
    host
      .waiting()
      .then((count) => {
        if (shown) setWaiting(count);
      })
      .catch((error: unknown) => console.error("The waiting feedback can't be counted:", error));
    return () => {
      shown = false;
    };
  }, [host]);
  return waiting;
}

/** One name, saved when the person leaves the field or presses Enter. */
function NameField(props: {
  readonly label: string;
  readonly settings: HostSettings;
  readonly setting: HostSetting<string>;
  readonly announce: (line: string) => void;
}) {
  const { label, settings, setting, announce } = props;
  const [stored, setStored] = useState(() => savedValue(settings, setting));
  const [draft, setDraft] = useState<string>();
  const [failed, setFailed] = useState(false);
  const saving = useRef(false);

  async function commit() {
    if (draft === undefined || saving.current) return;
    const name = draft.trim();
    saving.current = true;
    try {
      await (name === "" ? settings.reset(setting) : settings.set(setting, name));
      setStored(name === "" ? setting.fallback : name);
      setDraft(undefined);
      setFailed(false);
    } catch (error) {
      console.error(`${setting.key} wasn't saved:`, error);
      setFailed(true);
      announce(notSavedLine(label));
    } finally {
      saving.current = false;
    }
  }

  return (
    <Field label={label} error={failed ? notSavedLine(label) : null}>
      <Input
        value={draft ?? stored}
        maxLength={maxNameLength}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void settleOnClose(commit())}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !isComposing(event)) void settleOnClose(commit());
        }}
      />
    </Field>
  );
}
