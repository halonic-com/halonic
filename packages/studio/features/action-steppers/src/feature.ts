import { defineFeature } from "@halonicjs/studio-shell";

/**
 * The Action Steppers feature: the screen where the user reviews an agent's action request and
 * runs its steps with their own sign-in. It registers nothing yet: the screen is drawn from a
 * feature-local view model, and the pull request that wires it to `core/actions` and the app
 * service adds it to the Inbox (HAL-17488).
 */
export const actionSteppersFeature = defineFeature({
  id: "action-steppers",
  title: "Action Steppers",
  register() {
    // Nothing yet; see above.
  },
});
