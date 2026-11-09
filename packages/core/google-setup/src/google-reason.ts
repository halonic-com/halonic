/**
 * The reason codes a failed check may keep. Only these are kept, never any
 * other word: a reason is text from Google's answer, and a single word can
 * still be anything a request echoed, a token included (HAL-1226).
 *
 * - `ErrorInfo` reasons, as in Google's `ErrorReason` list:
 *   https://cloud.google.com/apis/design/errors#error_info
 * - the older `error.errors[*].reason` codes of Google's JSON APIs.
 */
const knownGoogleReasons: ReadonlySet<string> = new Set([
  // ErrorInfo reasons
  "SERVICE_DISABLED",
  "BILLING_DISABLED",
  "ACCESS_TOKEN_EXPIRED",
  "ACCESS_TOKEN_SCOPE_INSUFFICIENT",
  "ACCESS_TOKEN_TYPE_UNSUPPORTED",
  "RATE_LIMIT_EXCEEDED",
  "RESOURCE_QUOTA_EXCEEDED",
  "CONSUMER_INVALID",
  "CONSUMER_SUSPENDED",
  "USER_PROJECT_DENIED",
  "IAM_PERMISSION_DENIED",
  "ORG_RESTRICTION_VIOLATION",
  "SECURITY_POLICY_VIOLATED",
  // Older JSON API reasons
  "accessNotConfigured",
  "authError",
  "backendError",
  "badRequest",
  "dailyLimitExceeded",
  "domainPolicy",
  "failedPrecondition",
  "forbidden",
  "insufficientPermissions",
  "internalError",
  "notFound",
  "quotaExceeded",
  "rateLimitExceeded",
  "userRateLimitExceeded",
]);

/** Whether the text is one of the reason codes a failed check keeps. */
export function isKnownGoogleReason(text: string): boolean {
  return knownGoogleReasons.has(text);
}
