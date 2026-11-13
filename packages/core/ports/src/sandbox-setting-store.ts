/** Version of the {@link SandboxSettingStore} port. A breaking change bumps it and comes with an ADR. */
export const sandboxSettingStoreVersion = 1;

/** Every sandbox backend Halonic knows, by id. A new backend is a new entry here. */
export const sandboxBackendIds = ["srt", "srt-wsl", "mxc", "docker-sbx", "cloud"] as const;

/** A sandbox backend: one of {@link sandboxBackendIds}. */
export type SandboxBackendId = (typeof sandboxBackendIds)[number];

/**
 * The person's choice of sandbox: a backend, or to continue without one.
 * "Not chosen yet" is no record, which is `null` from the store.
 *
 * @example
 * const setting: SandboxSetting = { backend: "srt-wsl", chosenAt: "2026-11-13T09:00:00.000Z" };
 * const without: SandboxSetting = {
 *   backend: "none",
 *   chosenAt: "2026-11-13T09:00:00.000Z",
 *   appVersion: "0.1.0",
 * };
 */
export type SandboxSetting =
  | {
      /** The backend the person chose. */
      backend: SandboxBackendId;
      /** When the person chose, as ISO text. */
      chosenAt: string;
    }
  | {
      /** The person chose to continue without a sandbox. */
      backend: "none";
      /** When the person chose, as ISO text. */
      chosenAt: string;
      /** The Halonic version that was running when they chose. */
      appVersion: string;
    };

/**
 * The person's sandbox choice for this computer and this operating system
 * user (requirement `ports.sandbox-setting-store`), in the user's profile:
 * the profile folder for the CLI and `serve`, the app data folder for the
 * desktop app, memory for tests and the browser demo. **Never inside a
 * workspace**, so an agent that edits the workspace can't change the
 * sandbox it runs in. It replaces the earlier MXC `on`/`off` setting.
 *
 * The port only stores the choice. `SandboxChoiceService` in `core/app`
 * reads it and decides what runs. Only a person makes a choice: no tool the
 * model can call reaches this store.
 *
 * A saved choice that exists but can't be read makes `get` throw, never
 * return `null`: `null` means the onboarding hasn't run, and the caller must
 * not take a damaged choice for that. `remove` still deletes it, and `save`
 * still replaces it.
 */
export interface SandboxSettingStore {
  /** The saved choice, or `null` when none is saved. */
  get(): Promise<SandboxSetting | null>;
  /** Saves a choice, replacing any saved before. */
  save(setting: SandboxSetting): Promise<void>;
  /** Deletes the choice, even one that can't be read. Removing a choice that isn't there is not an error. */
  remove(): Promise<void>;
}

const backendFields = ["backend", "chosenAt"] as const;
const noneFields = ["backend", "chosenAt", "appVersion"] as const;

/**
 * Whether `value`, as read back from a store, is a valid choice: exactly the
 * fields of a {@link SandboxSetting}, each text, and a backend that is
 * {@link sandboxBackendIds} or `"none"`. Anything else is a damaged or
 * hand-edited choice and must never pick a sandbox. Every adapter checks
 * what it reads with this, and `SandboxChoiceService` in `core/app` checks
 * what an adapter gives back with it again.
 *
 * @example
 * isSandboxSetting(JSON.parse(text)); // false for `{ backend: "docker", chosenAt }`
 */
export function isSandboxSetting(value: unknown): value is SandboxSetting {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as { readonly [field: string]: unknown };
  const backend = record["backend"];
  if (backend === "none") return hasExactlyTextFields(record, noneFields);
  return (
    typeof backend === "string" &&
    (sandboxBackendIds as readonly string[]).includes(backend) &&
    hasExactlyTextFields(record, backendFields)
  );
}

function hasExactlyTextFields(
  record: { readonly [field: string]: unknown },
  fields: readonly string[],
): boolean {
  return (
    Object.keys(record).length === fields.length &&
    fields.every((field) => Object.hasOwn(record, field) && typeof record[field] === "string")
  );
}
