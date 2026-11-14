import { Disclosure, Field, Switch } from "@halonicjs/studio-kit";
import { useEffect, useRef, useState } from "react";
import { checkBaseUrl, checkSecretName } from "./assistant-checks.ts";
import type { AssistantProvider } from "./assistant-providers.ts";
import * as text from "./assistant-text.ts";
import { SavedTextField } from "./saved-text-field.tsx";

/** The props of {@link HowItConnects}. */
export interface HowItConnectsProps {
  readonly provider: AssistantProvider;
  readonly baseUrl: string;
  readonly secretName: string;
  readonly local: boolean;
  readonly baseUrlFailed: boolean;
  readonly secretNameFailed: boolean;
  readonly localFailed: boolean;
  readonly saveBaseUrl: (value: string) => Promise<boolean>;
  readonly saveSecretName: (value: string) => Promise<boolean>;
  readonly toggleLocal: (on: boolean) => void;
  /** True right after OpenAI-compatible was picked: open the row and put the focus in Base URL. */
  readonly focusBaseUrl: boolean;
}

/** The failed-save line under a field, in the section's words. */
const failed = (what: string, is: boolean) => (is ? text.notSaved(what) : null);

/**
 * The "How it connects" row: Base URL, Secret name and Local. It is closed unless it needs the
 * person: OpenAI-compatible with no Base URL, or right after that provider is picked
 * (`settings.ai-agent-connection`).
 *
 * @example
 * <HowItConnects provider="openai-compatible" baseUrl="" focusBaseUrl … />
 */
export function HowItConnects(props: HowItConnectsProps) {
  const { provider, baseUrl, focusBaseUrl } = props;
  const body = useRef<HTMLDivElement>(null);
  const needsYou = provider === "openai-compatible" && baseUrl === "";
  // Fixed after the first render: the row never closes by itself, so a field's save can't
  // snap it shut or remount it under the person. It opens through the effect below instead.
  const [openAtFirst] = useState(needsYou || focusBaseUrl);
  useEffect(() => {
    if (!(needsYou || focusBaseUrl)) return;
    const details = body.current?.querySelector("details");
    if (details) details.open = true;
  }, [needsYou, focusBaseUrl]);
  useEffect(() => {
    if (focusBaseUrl) body.current?.querySelector("input")?.focus();
  }, [focusBaseUrl]);
  return (
    <div ref={body}>
      <Disclosure summary={text.HOW_IT_CONNECTS} defaultOpen={openAtFirst}>
        <div className="flex flex-col gap-4">
          <SavedTextField
            label={text.BASE_URL}
            stored={baseUrl}
            check={(typed) => checkBaseUrl(provider, typed)}
            save={props.saveBaseUrl}
            saveError={failed("the Base URL", props.baseUrlFailed)}
          />
          <SavedTextField
            label={text.SECRET_NAME}
            stored={props.secretName}
            check={checkSecretName}
            save={props.saveSecretName}
            saveError={failed("the secret name", props.secretNameFailed)}
          />
          <Field label={text.LOCAL} error={failed("Local", props.localFailed)}>
            <Switch checked={props.local} onChange={props.toggleLocal}>
              {text.LOCAL_SENTENCE}
            </Switch>
          </Field>
        </div>
      </Disclosure>
    </div>
  );
}
