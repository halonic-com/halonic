import type { AdminRoute } from "./admin.ts";

function notBuilt(): Response {
  return Response.json(
    { code: "not_implemented", message: "This route isn't built yet." },
    { status: 501, headers: { "cache-control": "no-store" } },
  );
}

/**
 * The export and import routes of the Worker, in the paths the contract names
 * (see the package README). Their answers come in later parts of HAL-9486; until
 * then each one answers 501 once the admin key has been checked.
 */
export const adminRoutes: readonly AdminRoute[] = [
  { method: "GET", path: "/admin/export", handler: notBuilt },
  { method: "GET", path: "/admin/export/files", below: true, handler: notBuilt },
  { method: "PUT", path: "/admin/import/files", below: true, handler: notBuilt },
  { method: "POST", path: "/admin/import", handler: notBuilt },
];
