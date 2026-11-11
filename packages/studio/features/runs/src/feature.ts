import { defineFeature } from "@halonicjs/studio-shell";
import { RunsSourceService } from "./api.ts";

/**
 * The Runs feature. It reads the open workspace's runs from the source the
 * app provides (`RunsSourceService`). Its list page, run page, Home's
 * Recent runs and Ctrl K's run rows register here as they land (HAL-1301).
 */
export const runsFeature = defineFeature({
  id: "runs",
  title: "Runs",
  needs: [RunsSourceService],
  register() {
    // Nothing to show yet: the list page comes in the next pull request.
  },
});
