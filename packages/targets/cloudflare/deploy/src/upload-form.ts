import type { DeployedVersion, DurableObjectMigration, WorkerUpload } from "./api.ts";

const workerFile = "worker.js";

/** The multipart body of an upload: metadata (bindings, secrets) and the script. */
export function uploadForm(upload: WorkerUpload, extra: Record<string, unknown>): FormData {
  const bindings = [
    ...upload.bindings,
    ...Object.entries(upload.secrets).map(([name, text]) => ({
      type: "secret_text",
      name,
      text,
    })),
  ];
  const metadata = {
    main_module: workerFile,
    compatibility_date: upload.compatibilityDate,
    bindings,
    ...extra,
  };
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  form.append(
    workerFile,
    new Blob([upload.script], { type: "application/javascript+module" }),
    workerFile,
  );
  return form;
}

/** The body of a deployment that splits traffic by percentage. */
export function deploymentBody(versions: readonly DeployedVersion[]) {
  return {
    strategy: "percentage",
    versions: versions.map((v) => ({ version_id: v.id, percentage: v.percentage })),
  };
}

/** The script upload takes one migration object, or `{ new_tag, steps }` for several. */
export function oneMigration(migrations: readonly DurableObjectMigration[]) {
  const [first, ...rest] = migrations;
  if (first && rest.length === 0) return { new_tag: first.tag, ...without(first) };
  return {
    new_tag: migrations[migrations.length - 1]?.tag,
    steps: migrations.map((m) => without(m)),
  };
}

function without(migration: DurableObjectMigration) {
  const { tag: _tag, ...rest } = migration;
  return rest;
}
