/**
 * Whether Settings shows the controls that save a choice nothing uses yet: Agent sandbox's
 * **New agents run**, the whole Assistant section, and Appearance's Panel opacity and Agent
 * characters. The board hid them until they work (HAL-12643). Their saved values and code stay,
 * and their tests turn them on, so they come back by changing this one value. Notifications stays
 * hidden the same way until the background service shows run notifications (HAL-18845). Your server
 * shows since the Inbox offers "Run with Claude" (HAL-18256).
 */
export const showUnfinishedSettings = false;

/** The sections Settings leaves out while {@link showUnfinishedSettings} is off. */
export const unfinishedSectionIds: readonly string[] = ["assistant", "notifications"];
