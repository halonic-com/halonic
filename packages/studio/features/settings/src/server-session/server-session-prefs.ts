import { hostSetting } from "@halonicjs/app";

const isText = (value: unknown): value is string => typeof value === "string";

/** Whether `value` is an ssh port: a whole number from 1 to 65535, or `null` for ssh's own. */
export function isServerPort(value: unknown): value is number | null {
  return (
    value === null ||
    (Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 65535)
  );
}

/**
 * The user's own server for "Run with Claude" (`settings.server-session`, plan on HAL-17834,
 * section 3): kept where Halonic runs, never in a workspace, a request or a card. The desktop
 * shell reads them itself and checks them again. An empty field is removed, never saved, so the
 * shell finds nothing and says the server isn't set up.
 */
export const serverSessionPrefs = {
  host: hostSetting("server-session.host", "", isText),
  user: hostSetting("server-session.user", "", isText),
  port: hostSetting<number | null>("server-session.port", null, isServerPort),
};
