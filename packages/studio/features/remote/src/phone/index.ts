/**
 * The phone's tunnel screens and the logic under them (task D5). They run in the Android app,
 * not in the desktop shell, so nothing under `src/phone/` imports `@halonicjs/studio-shell`
 * (`phone-boundary.test.ts`).
 */
export {
  agentsAsOfText,
  asOfText,
  dayOf,
  secondsText,
  spelled,
  spoken,
  timeOf,
  triesLeftText,
} from "./phone-forms.ts";
export {
  type PhoneState,
  type PhoneStatusChange,
  type PhoneStatusLabel,
  type PhoneStatusTone,
  PhoneStatusTracker,
  phoneStatusLabel,
  RECONNECTING_QUIET_MS,
} from "./phone-status.ts";
