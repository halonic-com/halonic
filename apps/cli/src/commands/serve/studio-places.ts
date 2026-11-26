import { fileURLToPath } from "node:url";

/** Where the built Studio page is and the app it is built from. */
export interface StudioPlaces {
  /** The page as `pnpm --filter @halonicjs/app-studio build` leaves it. */
  readonly page: string;
  /** The Studio app that build reads, to tell when the page is older than it. */
  readonly app: string;
}

/**
 * The Studio page and app for code at `codeUrl`, in the repository; none in the npm package,
 * which doesn't ship the page. `serve` reads the page where it is built and keeps no copy.
 */
export function studioPlacesFor(npmPackage: boolean, codeUrl: string): StudioPlaces | null {
  if (npmPackage) return null;
  return {
    page: fileURLToPath(new URL("../../../../studio/dist/studio", codeUrl)),
    app: fileURLToPath(new URL("../../../../studio", codeUrl)),
  };
}
