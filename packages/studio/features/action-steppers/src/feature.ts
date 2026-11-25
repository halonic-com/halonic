import { defineFeature } from "@halonicjs/studio-shell";

/**
 * The Action Steppers feature: the screen where the user reviews an agent's action request and
 * runs its steps with their own sign-in. It registers nothing: the Inbox opens action items with
 * the review and the screen from `api.ts`, and the app provides the catalog and the requester
 * policy once they ship (HAL-17488).
 */
export const actionSteppersFeature = defineFeature({
  id: "action-steppers",
  title: "Action Steppers",
  register() {
    // Nothing yet; see above.
  },
});
