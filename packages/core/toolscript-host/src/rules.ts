/**
 * The ToolScript ADR's security rules (HAL-17560, section 3.2) this package
 * enforces once the host lands. The host itself follows in its own pull
 * request, because the policy rules read `coreOrder` from the base commit.
 */
export const toolScriptHostRules: readonly string[] = Object.freeze([
  "S3",
  "S4",
  "S7",
  "S9",
  "S14",
  "S15",
  "S16",
  "S17",
]);
