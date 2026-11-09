import type { CheckContext } from "../lib/context.ts";

// The API types packages, listed under "apiTypes" in the policy, hold the
// types Studio, the CLI and outside callers use to talk to Halonic. They use
// only each other, so a caller gets them without the engine. The layers rule
// applies this; see docs/adr/2026-11-09-api-types-stand-alone.md.

/** True for a package listed under "apiTypes" in the policy. */
export function isApiTypes(context: CheckContext, packageName: string): boolean {
  return context.policy.apiTypes.includes(packageName);
}

/** Why an API types package may not use another core package or third-party code. */
export function apiTypesProblem(context: CheckContext, packageName: string): string {
  return `${packageName} holds API types, so it may use only other API types packages ("apiTypes" in ${context.policyPath}) and no third-party code. Studio, the CLI and outside callers use it without the engine. Move what it needs into an API types package. See docs/adr/2026-11-09-api-types-stand-alone.md.`;
}
