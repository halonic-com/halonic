import {
  type ChoiceEdits,
  type ChoiceProblem,
  choiceEdits,
  choiceProvider,
  keyProblem,
  type ModelChoice,
  modelTestRequest,
  type TestResult,
  testOutcome,
  testTimeLimitMs,
} from "@halonicjs/app";
import { type Provider, parseFile } from "@halonicjs/format";
import { type Digest, type LlmProvider, type Secrets, secretKey } from "@halonicjs/ports";
import type {
  ModelChoicePreview,
  ModelChoiceSaved,
  ModelChoiceService,
  ModelChoiceTest,
} from "@halonicjs/studio-feature-first-run/api";
import type { ModelKeys, ModelsFiles } from "@halonicjs/studio-feature-models/api";
import { SecretText } from "@halonicjs/studio-kit";
import type { WorkspaceTrust } from "../studio/workspace-trust.ts";
import { choicePreview } from "./first-run-choice-trust.ts";

/** What the first run's model choice reads and writes, all for the one open folder. */
export interface FirstRunModelChoiceParts {
  readonly files: Pick<ModelsFiles, "readModels" | "readWorkspace" | "readProvider">;
  /** Changes files as one undo step, without saving them. */
  readonly change: (label: string, changes: Record<string, string>) => void;
  /** Saves what is waiting; rejects when the save fails. */
  readonly settle: () => Promise<void>;
  readonly keys: Pick<ModelKeys, "save">;
  readonly trust: Pick<
    WorkspaceTrust,
    "check" | "needsNoTrust" | "refresh" | "grant" | "isTrusted"
  >;
  readonly digest: Digest;
  /** Makes a provider from its file, as a run does (`workspaceProvider`). */
  readonly provider: (file: Provider, secrets: Secrets) => LlmProvider;
  /** Calls `callback` after `delayMs`; returns the way to cancel it. */
  readonly setTimer: (callback: () => void, delayMs: number) => () => void;
  readonly newTestId: () => string;
}

/** A passed test, the one way to continue: the key lives here, in memory, until Continue. */
interface PassedTest {
  readonly id: string;
  readonly choice: ModelChoice;
  readonly key: SecretText | undefined;
}

/**
 * The first run's Test and continue (first-run-flow 3.3, 10.2 R4). It calls the model through the
 * adapter a run uses, with only the pasted key in memory; saves the key only after its test
 * passed; and trusts the folder only for the content the trust line showed. No error, log or
 * answer it gives holds the key.
 */
export class FirstRunModelChoice implements ModelChoiceService {
  readonly #parts: FirstRunModelChoiceParts;
  #passed: PassedTest | undefined;
  /** Counts the tests, so one that ends after a newer one started keeps no key. */
  #latest = 0;

  constructor(parts: FirstRunModelChoiceParts) {
    this.#parts = parts;
  }

  async test(choice: ModelChoice, key?: SecretText): Promise<ModelChoiceTest> {
    this.#passed = undefined;
    const mine = ++this.#latest;
    let tested: SecretText | undefined;
    if (choice.kind === "key") {
      const text = key?.reveal() ?? "";
      const problem = keyProblem(choice.provider, text);
      if (problem !== undefined) return { kind: "not-a-key", problem };
      tested = new SecretText(text.trim());
    }
    const edits = await this.#edits(choice);
    if (!edits.ok) return { kind: "files", problem: edits.problem };
    const outcome = testOutcome(choice, await this.#call(choice, edits, tested));
    if (outcome !== "ok") return { kind: "tested", outcome };
    if (mine !== this.#latest) return { kind: "superseded" };
    const id = this.#parts.newTestId();
    this.#passed = { id, choice, key: tested };
    return { kind: "tested", outcome, testId: id };
  }

  async preview(testId: string): Promise<ModelChoicePreview | undefined> {
    const passed = this.#passedTest(testId);
    if (passed === undefined) return undefined;
    const edits = await this.#edits(passed.choice);
    if (!edits.ok) return undefined;
    await this.#parts.trust.refresh();
    const { trust, digest } = this.#parts;
    return choicePreview({
      before: trust.check,
      needsNoTrust: trust.needsNoTrust,
      added: edits.added,
      name: choiceProvider(passed.choice).name,
      localOnlyOff: edits.value.changes.some((change) => change.kind === "local-only-off"),
      digest,
    });
  }

  async continue(testId: string, shownFingerprint: string | undefined): Promise<ModelChoiceSaved> {
    const passed = this.#passedTest(testId);
    this.#passed = undefined;
    if (passed === undefined) {
      return {
        ok: false,
        failed: "no-test",
        keySaved: false,
        reason: "No passed test has this id.",
      };
    }
    const edits = await this.#edits(passed.choice);
    if (!edits.ok) {
      return { ok: false, failed: "files", keySaved: false, reason: problemReason(edits.problem) };
    }
    const { secretName, files, changes } = edits.value;
    let keySaved = false;
    if (passed.key !== undefined && secretName !== undefined) {
      try {
        await this.#parts.keys.save(secretName, passed.key);
        keySaved = true;
      } catch (error) {
        // Only the error's kind: the keychain's own message is the one text here that could repeat the key.
        const kind = error instanceof Error ? error.name : "unknown error";
        return {
          ok: false,
          failed: "key",
          keySaved,
          reason: `The keychain didn't save the key (${kind}).`,
        };
      }
    }
    try {
      if (files.length > 0) {
        const texts = Object.fromEntries(files.map((file) => [file.path, file.text]));
        this.#parts.change("Updated model alias default", texts);
        await this.#parts.settle();
      }
    } catch (error) {
      return { ok: false, failed: "write", keySaved, reason: reasonOf(error) };
    }
    return { ok: true, changes, trusted: await this.#trust(shownFingerprint) };
  }

  /** Trusts the folder when its files now lead to the fingerprint the line showed; never another. */
  async #trust(shownFingerprint: string | undefined): Promise<boolean> {
    const { trust } = this.#parts;
    await trust.refresh();
    if (shownFingerprint !== undefined && !trust.isTrusted()) {
      // A refusal means the files changed since the line was shown: the next Run asks as usual.
      await trust.grant(shownFingerprint);
    }
    return trust.isTrusted();
  }

  #passedTest(testId: string): PassedTest | undefined {
    return this.#passed?.id === testId ? this.#passed : undefined;
  }

  /** The choice's edits on the files as they are now, and the provider file a run would use. */
  async #edits(
    choice: ModelChoice,
  ): Promise<
    | { ok: true; value: ChoiceEdits; file: Provider; added: Provider | undefined }
    | { ok: false; problem: ChoiceProblem }
  > {
    const { files } = this.#parts;
    const provider = choiceProvider(choice);
    const path = `providers/${provider.id}.yaml`;
    const [models, workspace, existing] = await Promise.all([
      files.readModels(),
      files.readWorkspace(),
      files.readProvider(path),
    ]);
    if (models === null) return { ok: false, problem: { kind: "unreadable", file: "models.yaml" } };
    if (workspace === null) {
      return { ok: false, problem: { kind: "unreadable", file: "workspace.yaml" } };
    }
    const edits = choiceEdits(choice, { models, workspace, provider: existing ?? undefined });
    if (!edits.ok) return { ok: false, problem: edits.error };
    const parsed = parseFile("provider", existing ?? provider.fileText, { id: provider.id });
    if (!parsed.ok) return { ok: false, problem: { kind: "provider-differs", file: path } };
    const file = parsed.value.value;
    return { ok: true, value: edits.value, file, added: existing === null ? file : undefined };
  }

  /** The one test call, cut off at the choice's time limit; what came back, never thrown. */
  async #call(
    choice: ModelChoice,
    edits: { value: ChoiceEdits; file: Provider },
    key: SecretText | undefined,
  ): Promise<TestResult> {
    const limit = new AbortController();
    const stop = this.#parts.setTimer(() => limit.abort(), testTimeLimitMs(choice));
    try {
      const secrets = onlySecret(edits.value.secretName, key);
      const model = this.#parts.provider(edits.file, secrets);
      return { reply: await model.chat(modelTestRequest(choice, limit.signal)) };
    } catch (error) {
      return { error };
    } finally {
      stop();
    }
  }
}

/** Secrets holding only the pasted key, under the provider's secret name. */
function onlySecret(name: string | undefined, key: SecretText | undefined): Secrets {
  return {
    get: async (asked) =>
      name !== undefined && key !== undefined && secretKey(asked) === secretKey(name)
        ? key.reveal()
        : null,
  };
}

function problemReason(problem: ChoiceProblem): string {
  return problem.kind === "unreadable"
    ? `Halonic couldn't read ${problem.file}.`
    : `${problem.file} is set up for another address or type.`;
}

function reasonOf(error: unknown): string {
  return error instanceof Error && error.message !== "" ? error.message : "unknown error";
}
