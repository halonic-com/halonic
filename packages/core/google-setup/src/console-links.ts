/**
 * The Google Cloud Console pages the setup steps link to. The paths are
 * checked against the live Console before release (HAL-687), so they live
 * here, in one place.
 */
const consoleOrigin = "https://console.cloud.google.com";

/** A Console page that takes the project as `?project=<id>`. */
export type ConsolePage =
  | "new-project"
  | "branding"
  | "audience"
  | "data-access"
  | "clients"
  | "create-client";

const consolePaths: Readonly<Record<ConsolePage, string>> = {
  "new-project": "/projectcreate",
  branding: "/auth/branding",
  audience: "/auth/audience",
  "data-access": "/auth/scopes",
  clients: "/auth/clients",
  "create-client": "/auth/clients/create",
};

/**
 * Google's rule for project IDs: 6 to 30 characters, lower-case letters,
 * digits and `-`, starting with a letter and not ending in `-`.
 */
const projectIdPattern = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;

/** A Google API host, such as `example.googleapis.com`. */
const apiHostPattern = /^[a-z][a-z0-9-]*\.googleapis\.com$/;

/**
 * Whether the text is a valid Google Cloud project ID. Only a valid ID goes
 * into a link, so a typo can't make a broken URL or one that points elsewhere.
 *
 * @example
 * isProjectId("halonic-x1"); // true
 * isProjectId("Halonic X"); // false
 */
export function isProjectId(text: string): boolean {
  return projectIdPattern.test(text);
}

/**
 * Checks an API name from a sheet before it becomes part of a URL. The sheet
 * check in the integrations repo already refuses anything else, so this only
 * fails on a sheet that skipped it.
 *
 * @throws RangeError when the name isn't a Google API host.
 */
export function checkApiHost(api: string): string {
  if (!apiHostPattern.test(api)) {
    throw new RangeError(
      "A googleApis entry is not a Google API host. Use the form <name>.googleapis.com.",
    );
  }
  return api;
}

/** `?project=<id>` or `&project=<id>`, or nothing when the project isn't known. */
function projectParameter(projectId: string | undefined, separator: "?" | "&"): string {
  return projectId === undefined ? "" : `${separator}project=${projectId}`;
}

/**
 * The URL of a Console page, in the project when its ID is known.
 *
 * @param projectId - a project ID that passed `isProjectId`, or `undefined`.
 */
export function consoleUrl(page: ConsolePage, projectId: string | undefined): string {
  return `${consoleOrigin}${consolePaths[page]}${projectParameter(projectId, "?")}`;
}

/** The URL of one API's page in the API library, where its "Enable" button is. */
export function enableApiUrl(api: string, projectId: string | undefined): string {
  return `${consoleOrigin}/apis/library/${checkApiHost(api)}${projectParameter(projectId, "?")}`;
}

/**
 * Google's documented link that switches on several APIs at once. The API
 * names are joined with a bare `,`, as Google writes the link; that's also why
 * the URL is built as text rather than with `URLSearchParams`, which would
 * encode the comma.
 */
export function enableAllApisUrl(apis: readonly string[], projectId: string | undefined): string {
  const apiIds = apis.map(checkApiHost).join(",");
  return `${consoleOrigin}/flows/enableapi?apiid=${apiIds}${projectParameter(projectId, "&")}`;
}
