import type { HostSettings } from "@halonicjs/app";
import type { SettingsSectionProps } from "@halonicjs/studio-shell";
import { HostSettingsService } from "../api.ts";
import type { FieldCheck } from "../assistant/assistant-checks.ts";
import { notSaved } from "../assistant/assistant-text.ts";
import { SavedTextField } from "../assistant/saved-text-field.tsx";
import { useHostSetting } from "../assistant/use-host-setting.ts";
import { serverSessionPrefs } from "./server-session-prefs.ts";
import * as text from "./server-session-text.ts";

/** Settings › Your server as the settings container shows it. */
export function ServerSessionSection({ context }: SettingsSectionProps) {
  const settings = context.services.get(HostSettingsService);
  if (!settings.loaded) return <p className="text-body text-fg">{text.NOT_LOADED}</p>;
  return <ServerSessionView settings={settings} />;
}

/** A text field's value as saved: trimmed, and `undefined` for an empty one, which is removed. */
function checkText(typed: string): FieldCheck<string | undefined> {
  const trimmed = typed.trim();
  return { ok: true, value: trimmed === "" ? undefined : trimmed };
}

/** The port as saved: a whole number from 1 to 65535, or `undefined` for an empty field. */
export function checkPort(typed: string): FieldCheck<number | undefined> {
  const trimmed = typed.trim();
  if (trimmed === "") return { ok: true, value: undefined };
  const port = /^[0-9]{1,5}$/.test(trimmed) ? Number(trimmed) : Number.NaN;
  if (!(port >= 1 && port <= 65535)) return { ok: false, error: text.PORT_ERROR };
  return { ok: true, value: port };
}

/**
 * The server's host, user and port (`settings.server-session`). Each saves when you leave it;
 * whether they make a server ssh takes is checked where they're used: the "Run with Claude"
 * button says why, and the desktop shell checks them again.
 */
export function ServerSessionView({ settings }: { readonly settings: HostSettings }) {
  const host = useHostSetting(settings, serverSessionPrefs.host);
  const user = useHostSetting(settings, serverSessionPrefs.user);
  const port = useHostSetting(settings, serverSessionPrefs.port);
  return (
    <div className="flex max-w-90 flex-col gap-4">
      <SavedTextField
        label={text.HOST_LABEL}
        hint={text.HOST_HINT}
        placeholder={text.HOST_PLACEHOLDER}
        stored={host.value}
        check={checkText}
        save={host.save}
        saveError={host.failed ? notSaved("the server") : null}
        mono
      />
      <SavedTextField
        label={text.USER_LABEL}
        placeholder={text.USER_PLACEHOLDER}
        stored={user.value}
        check={checkText}
        save={user.save}
        saveError={user.failed ? notSaved("the user") : null}
        mono
      />
      <SavedTextField
        label={text.PORT_LABEL}
        hint={text.PORT_HINT}
        placeholder={text.PORT_PLACEHOLDER}
        stored={port.value === null ? "" : String(port.value)}
        check={checkPort}
        save={port.save}
        saveError={port.failed ? notSaved("the port") : null}
        mono
      />
    </div>
  );
}
