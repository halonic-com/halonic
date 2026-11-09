/**
 * Hand-written Google answers to a check, in the shape Google sends
 * (https://cloud.google.com/apis/design/errors#error_info), the same shapes
 * as the integrations' `service-disabled.ts` fixtures. The project number is
 * made up. The free text quotes invented user content, as Google's can, so
 * tests can check that none of it reaches a result.
 */

export const fakeProjectNumber = "123456789012";

/** Free text that must never reach a result. */
export const userContent = "Holiday plans for alex@example.com";

/** Google's full answer for a switched-off API: `accessNotConfigured` and `ErrorInfo`. */
export function serviceDisabledJson(metadata: Record<string, unknown> = {}): unknown {
  const api = "ledger.googleapis.com";
  const activationUrl = `https://console.developers.google.com/apis/api/${api}/overview?project=${fakeProjectNumber}`;
  return {
    error: {
      code: 403,
      message: `The API is disabled. ${userContent}`,
      errors: [{ message: userContent, domain: "usageLimits", reason: "accessNotConfigured" }],
      status: "PERMISSION_DENIED",
      details: [
        {
          "@type": "type.googleapis.com/google.rpc.ErrorInfo",
          reason: "SERVICE_DISABLED",
          domain: "googleapis.com",
          metadata: {
            service: api,
            consumer: `projects/${fakeProjectNumber}`,
            activationUrl,
            serviceTitle: userContent,
            ...metadata,
          },
        },
        {
          "@type": "type.googleapis.com/google.rpc.LocalizedMessage",
          locale: "en-US",
          message: userContent,
        },
      ],
    },
  };
}

/** Only the older `errors` list, as some APIs still answer. */
export function accessNotConfiguredJson(): unknown {
  return {
    error: {
      code: 403,
      message: userContent,
      errors: [{ message: userContent, domain: "usageLimits", reason: "accessNotConfigured" }],
    },
  };
}

/** A plain Google error with one `errors` entry. */
export function googleErrorJson(code: number, reason: unknown): unknown {
  return {
    error: {
      code,
      message: userContent,
      errors: [{ message: userContent, domain: "global", reason }],
    },
  };
}
