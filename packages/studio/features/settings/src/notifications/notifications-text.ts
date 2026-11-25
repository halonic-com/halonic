/**
 * The words of Settings → Notifications besides the switches, which are the design's own
 * (`runNotificationSettingWords`). The failed save and the failed load follow the Assistant's
 * lines; their wording is with Chief on HAL-18846.
 */
export const TITLE = "Notifications";
export const NOT_LOADED = "Couldn't load the notification settings";

/** "Couldn't save "When a run fails" on this computer." */
export function notSaved(sentence: string): string {
  return `Couldn't save "${sentence}" on this computer.`;
}

/** What a switch is back to after a failed save: "It's back on." */
export function switchBack(on: boolean): string {
  return `It's back ${on ? "on" : "off"}.`;
}
