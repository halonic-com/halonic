import { answerRequest } from "./routes.ts";

/**
 * The Worker's entry points. `fetch()` answers the health route only, until
 * `host/server` is on `main` (HAL-195); `scheduled()` joins in a later part.
 */
export const worker = {
  fetch(request: Request): Response {
    return answerRequest(request);
  },
};
