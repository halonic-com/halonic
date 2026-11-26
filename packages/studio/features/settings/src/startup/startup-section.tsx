import { SkeletonBar, Switch } from "@halonicjs/studio-kit";
import type { SettingsSectionProps } from "@halonicjs/studio-shell";
import { useEffect, useState } from "react";
import { HostSettingsService, LoginItemService } from "../api.ts";
import type { LoginItemAnswer, LoginItemHost, LoginItemRefusal } from "./login-item-host.ts";
import { ReopenWindowsSwitch } from "./reopen-windows-switch.tsx";
import * as text from "./startup-text.ts";

/**
 * Settings › Startup as the settings container shows it: the login item's switch, then **Reopen
 * windows on start**. The section is listed only where the app gives a login item (`available` in
 * `feature.ts`), so without one it draws nothing.
 */
export function StartupSection({ context, surface }: SettingsSectionProps) {
  const host = context.services.find(LoginItemService);
  if (host === undefined) return null;
  return (
    <div className="flex max-w-120 flex-col gap-4">
      <StartupView host={host} />
      <ReopenWindowsSwitch
        settings={context.services.get(HostSettingsService)}
        announce={(line) => context.announcer.announce(line)}
        surface={surface}
      />
    </div>
  );
}

/** What the switch shows: `null` until the shell first answers. */
interface LoginItemState {
  readonly on: boolean | null;
  /** The line under the switch, or `null` while the shell agreed. */
  readonly refused: string | null;
}

/**
 * The one switch, **Start Halonic when I log in**. It reads the login item once when it opens
 * and changes it only on a press. The switch always shows the shell's last answer: after a
 * refusal it keeps what it showed, with the reason under it.
 */
export function StartupView({ host }: { readonly host: LoginItemHost }) {
  const [state, setState] = useState<LoginItemState>({ on: null, refused: null });
  useEffect(() => {
    let current = true;
    void ask(() => host.get()).then((answer) => {
      if (current) setState((now) => after(now, answer, text.READ_FAILED));
    });
    return () => {
      current = false;
    };
  }, [host]);
  const change = (on: boolean) => {
    void ask(() => host.set(on)).then((answer) =>
      setState((now) => after(now, answer, text.REFUSED[refusalOf(answer)])),
    );
  };
  if (state.on === null && state.refused === null)
    return (
      <div role="status" aria-label={text.LOADING} className="w-1/2">
        <SkeletonBar kind="meta" />
      </div>
    );
  return (
    <div className="flex max-w-120 flex-col gap-2">
      <Switch checked={state.on === true} onChange={change}>
        <span className="flex flex-col">
          <span>{text.START_WHEN_I_LOG_IN}</span>
          <span className="text-small text-fg-muted">{text.hint(host.iconIn)}</span>
        </span>
      </Switch>
      <p role="status" className="text-small text-danger">
        {state.refused}
      </p>
    </div>
  );
}

/**
 * The shell's answer, with an unexpected rejection read as `failed` so the switch never sticks.
 * The app's host only rethrows what it didn't expect, so it is reported here before the switch
 * shows the short line.
 */
async function ask(call: () => Promise<LoginItemAnswer>): Promise<LoginItemAnswer> {
  try {
    return await call();
  } catch (error) {
    console.error("Couldn't read or change whether Halonic starts when you log in.", error);
    return { refused: "failed" };
  }
}

function refusalOf(answer: LoginItemAnswer): LoginItemRefusal {
  return "refused" in answer ? answer.refused : "failed";
}

/** The switch after the shell's answer: a refusal keeps what it showed and says `line`. */
function after(now: LoginItemState, answer: LoginItemAnswer, line: string): LoginItemState {
  if ("refused" in answer) return { on: now.on ?? false, refused: line };
  return { on: answer.on, refused: null };
}
