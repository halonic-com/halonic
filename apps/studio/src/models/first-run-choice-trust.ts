// The trust side of the first run's Continue (first-run-flow 3.3, Liam on
// HAL-13431): the trust line is the trust decision, so it is worked out from
// the difference the change makes to the folder's trust content, never written
// by hand, and Continue may trust only what the line showed.

import type { TrustCheck } from "@halonicjs/app";
import type { Provider } from "@halonicjs/format";
import type { Digest } from "@halonicjs/ports";
import type { ModelChoicePreview } from "@halonicjs/studio-feature-first-run/api";
import {
  type ProviderTrustContent,
  providersTrustContent,
  type TrustContent,
  trustChanges,
  trustFingerprint,
} from "@halonicjs/workspace";

/** What the preview reads: the folder's last trust check and the provider file the change adds. */
export interface ChoiceTrustInput {
  /** The folder's trust check before the change; `undefined` when none has finished. */
  readonly before: TrustCheck | undefined;
  /** Whether the folder reaches only the test model before the change (HAL-10131). */
  readonly needsNoTrust: boolean;
  /** The provider file the change adds, parsed; `undefined` when the folder has it already. */
  readonly added: Provider | undefined;
  /** The added provider's name for the line, such as "Anthropic". */
  readonly name: string;
  readonly localOnlyOff: boolean;
  readonly digest: Digest;
}

/**
 * The trust line's facts and the fingerprint Continue may trust. The
 * fingerprint is there only when the folder was trusted at its current
 * content, or reached only the test model, and the change adds exactly the
 * one provider: its host and its secret, or its local host. Anything else
 * gives none, so the next Run asks as usual.
 */
export async function choicePreview(input: ChoiceTrustInput): Promise<ModelChoicePreview> {
  const { before, added, localOnlyOff } = input;
  if (added === undefined) return { reaches: undefined, localOnlyOff, fingerprint: undefined };
  const content = providersTrustContent([added]).providers[0];
  if (content === undefined) return { reaches: undefined, localOnlyOff, fingerprint: undefined };
  const reaches = {
    name: input.name,
    secrets: content.secret === undefined ? 0 : 1,
    host: content.local ? hostOf(content.baseUrl) : undefined,
    local: content.local,
  };
  const beforeContent =
    before === undefined || before.status === "refused" ? undefined : before.content;
  const mayTrust = before?.status === "trusted" || input.needsNoTrust;
  if (beforeContent === undefined || !mayTrust) {
    return { reaches, localOnlyOff, fingerprint: undefined };
  }
  const after = withProvider(beforeContent, content);
  if (!addsOnly(beforeContent, after, content.id)) {
    return { reaches, localOnlyOff, fingerprint: undefined };
  }
  return { reaches, localOnlyOff, fingerprint: await trustFingerprint(after, input.digest) };
}

function withProvider(content: TrustContent, provider: ProviderTrustContent): TrustContent {
  const providers = [
    ...(content.providers ?? []).filter((item) => item.id !== provider.id),
    provider,
  ];
  providers.sort((left, right) => (left.id < right.id ? -1 : Number(left.id > right.id)));
  return { ...content, providers };
}

/** Whether `after` differs from `before` only by the one added provider. */
function addsOnly(before: TrustContent, after: TrustContent, id: string): boolean {
  const changes = trustChanges(before, after);
  const untouched = [changes, changes.agents, changes.integrations].every(
    (part) => part.added.length === 0 && part.changed.length === 0 && part.removed.length === 0,
  );
  const { providers } = changes;
  return (
    untouched &&
    providers.changed.length === 0 &&
    providers.removed.length === 0 &&
    providers.added.length === 1 &&
    providers.added[0]?.id === id
  );
}

/** The host and port of a local provider's address, such as `localhost:11434`; `trustUrl` already made it a valid URL. */
function hostOf(baseUrl: string | undefined): string | undefined {
  return baseUrl === undefined ? undefined : new URL(baseUrl).host;
}
