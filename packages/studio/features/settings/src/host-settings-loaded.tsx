import type { HostSettings } from "@halonicjs/app";
import { EmptyState } from "@halonicjs/studio-kit";
import { errorReasonFor, type SettingsSurface, sectionHeadingLevel } from "@halonicjs/studio-shell";
import { useState } from "react";
import * as text from "./assistant/assistant-text.ts";

/**
 * Whether the host settings are loaded, why not, and a way to load them again.
 * Settings › Assistant and Settings › Notifications read the same host settings.
 */
export function useLoaded(settings: HostSettings) {
  const [, redraw] = useState(0);
  const [trying, setTrying] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [recovered, setRecovered] = useState(false);
  return {
    ready: settings.loaded,
    trying,
    reason,
    /** True once a Try again has read the settings. */
    recovered,
    tryAgain: () => {
      setTrying(true);
      settings
        .load()
        .then(
          () => {
            setReason(null);
            setRecovered(true);
          },
          (error: unknown) => setReason(errorReasonFor(error, text.NOT_LOADED_REASON)),
        )
        .finally(() => {
          setTrying(false);
          redraw((count) => count + 1);
        });
    },
  };
}

/** What the section says when the host settings couldn't be read (`settings.ai-agent-section`). */
export function NotLoaded(props: {
  /** The heading; the Assistant's own by default. */
  readonly title?: string;
  readonly reason: string | null;
  readonly trying: boolean;
  readonly onTryAgain: () => void;
  readonly surface: SettingsSurface;
}) {
  return (
    <div className="max-w-90">
      <EmptyState
        tone="error"
        align="start"
        headingLevel={sectionHeadingLevel(props.surface)}
        title={props.title ?? text.NOT_LOADED}
        description={props.reason ?? text.NOT_LOADED_REASON}
        action={{ label: text.TRY_AGAIN, onClick: props.onTryAgain, busy: props.trying }}
      />
    </div>
  );
}
