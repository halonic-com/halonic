import type { ApiOff, ServiceCheckOutcome } from "./check-result.ts";
import { enableApiUrl, isApiHost, isProjectId } from "./console-links.ts";
import type { GoogleApi, SetupService } from "./setup-input.ts";

/** Google's answer to a sheet's `googleCheck`, as the host received it. */
export interface GoogleCheckAnswer {
  /** The HTTP status. */
  readonly status: number;
  /** The body parsed as JSON, or `undefined` when it wasn't JSON. */
  readonly json: unknown;
}

/** What one check's answer can mean. The other result kinds come from before the check. */
export type GoogleCheckMeaning = Extract<
  ServiceCheckOutcome,
  { readonly kind: "works" | "apiOff" | "checkFailed" }
>;

const errorInfoType = "type.googleapis.com/google.rpc.ErrorInfo";

/**
 * `projects/` and a project number, as Google writes `consumer` for
 * `SERVICE_DISABLED`. Only digits are kept: the project ID comes from the
 * setup, and a word here could be any text that happens to fit.
 */
const consumerPattern = /^projects\/(\d{1,20})$/;

/** Google's reason codes are single words, such as `accessNotConfigured` or `SERVICE_DISABLED`. */
const reasonPattern = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

/**
 * Reads one service's check answer:
 * - any 2xx status is `works`;
 * - a 403 that says the API is switched off is `apiOff`. Google says so in
 *   two places: the older `error.errors[*].reason` is `accessNotConfigured`,
 *   and the newer `error.details` hold an `ErrorInfo` whose reason is
 *   `SERVICE_DISABLED` and whose `metadata` names the API (`service`) and the
 *   project (`consumer`): https://cloud.google.com/apis/design/errors#error_info
 * - anything else is `checkFailed`, with the status and Google's reason code.
 *
 * The same rules as the integrations' reader (`disabled-api.ts`, A5): only
 * `metadata.service` and `metadata.consumer` are read. Every `message`, the
 * rest of the metadata and any reason that isn't a plain code are ignored,
 * because Google's free text can quote the user's data.
 *
 * Nothing in an `apiOff` result is text from Google's answer: the API and its
 * name come from the service's sheet, and the project from the setup or a
 * project number. Text that merely has the shape of a host or a project could
 * still be anything, a token included (HAL-1226).
 *
 * @param answer - the status and the parsed body
 * @param service - the service whose check this was; its sheet names the API
 * @param projectId - the project ID from the setup (step 1), if known. It
 *   makes a better link than the project number in Google's answer.
 */
export function readGoogleCheckAnswer(
  answer: GoogleCheckAnswer,
  service: SetupService,
  projectId?: string,
): GoogleCheckMeaning {
  const { status } = answer;
  if (status >= 200 && status <= 299) {
    return { kind: "works" };
  }
  const error = errorObject(answer.json);
  const infos = errorInfos(error);
  const entryReasons = errorEntryReasons(error);

  const serviceDisabled = infos.find((info) => info.reason === "SERVICE_DISABLED");
  if (status === 403 && (serviceDisabled || entryReasons.includes("accessNotConfigured"))) {
    return apiOff(serviceDisabled?.metadata, service, projectId);
  }

  const reason = infos.find((info) => info.reason !== undefined)?.reason ?? entryReasons[0];
  if (reason === undefined) {
    return { kind: "checkFailed", status };
  }
  return { kind: "checkFailed", status, reason };
}

/** The `apiOff` result, with the API only when the sheet lists it, and the project only when we trust it. */
function apiOff(
  metadata: Record<string, unknown> | undefined,
  service: SetupService,
  projectId: string | undefined,
): ApiOff {
  const listedApi = apiListedInSheet(metadata?.["service"], service);
  const projectNumber = projectFromConsumer(metadata?.["consumer"]);
  const project = projectId !== undefined && isProjectId(projectId) ? projectId : projectNumber;
  if (listedApi === undefined) {
    return { kind: "apiOff", ...(project === undefined ? {} : { project }) };
  }
  return {
    kind: "apiOff",
    api: listedApi.api,
    apiName: listedApi.name,
    ...(project === undefined ? {} : { project }),
    enableUrl: enableApiUrl(listedApi.api, project),
  };
}

/** The sheet's entry for the API Google named, or `undefined` when the sheet doesn't list it. */
function apiListedInSheet(googleService: unknown, service: SetupService): GoogleApi | undefined {
  return service.googleApis.find((entry) => entry.api === googleService && isApiHost(entry.api));
}

/** The `error` object of Google's answer, or `undefined` when there is none. */
function errorObject(json: unknown): Record<string, unknown> | undefined {
  if (!isJsonObject(json)) {
    return undefined;
  }
  const error = json["error"];
  return isJsonObject(error) ? error : undefined;
}

/** The parts of an `ErrorInfo` detail we read. */
interface ErrorInfo {
  /** The reason, when it is a plain code. */
  readonly reason?: string;
  /** The metadata, when it is an object. Only `service` and `consumer` are read from it. */
  readonly metadata?: Record<string, unknown>;
}

/** The `ErrorInfo` details, in order. Details of other types are skipped. */
function errorInfos(error: Record<string, unknown> | undefined): ErrorInfo[] {
  const details = error?.["details"];
  if (!Array.isArray(details)) {
    return [];
  }
  return details.filter(isJsonObject).flatMap((detail) => {
    if (detail["@type"] !== errorInfoType) {
      return [];
    }
    const reason = textMatching(detail["reason"], isReasonCode);
    const metadata = detail["metadata"];
    return [
      {
        ...(reason === undefined ? {} : { reason }),
        ...(isJsonObject(metadata) ? { metadata } : {}),
      },
    ];
  });
}

/** The plain reason codes of `error.errors[*]`, skipping any entry we can't read. */
function errorEntryReasons(error: Record<string, unknown> | undefined): string[] {
  const entries = error?.["errors"];
  if (!Array.isArray(entries)) {
    return [];
  }
  return entries.flatMap((entry) => {
    const reason = isJsonObject(entry) ? textMatching(entry["reason"], isReasonCode) : undefined;
    return reason === undefined ? [] : [reason];
  });
}

/** The project number from a `consumer` such as `projects/123456789012`. */
function projectFromConsumer(consumer: unknown): string | undefined {
  return typeof consumer === "string" ? consumerPattern.exec(consumer)?.[1] : undefined;
}

/** The value when it is text that passes the test, or `undefined`. */
function textMatching(value: unknown, test: (text: string) => boolean): string | undefined {
  return typeof value === "string" && test(value) ? value : undefined;
}

function isReasonCode(text: string): boolean {
  return reasonPattern.test(text);
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
