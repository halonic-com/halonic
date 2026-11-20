# studio.workspace-routines-make-live

- Status: active
- Since: unreleased
- Source: HAL-13215 (Tomas's half of the split); flow-routines 3 (Run now's "Make live first" and "Make live and run"); `source-control.create-version-elsewhere`

When the desktop app gives the Routines feature a folder's routines, it shall give the routine's Make live, which opens source control's Create version with only the routine's own file in it and answers `made` once the version is created and `cancelled` when the person closed it without one. Where the app has no Create version to open, the routines shall have no Make live, so Run now's dialog offers neither "Make live first" nor "Make live and run".

## Examples

- Given Acme's hub with the routine `weekly-report`, when its Make live is used, then Create version opens with only `hubs/acme/workflows/routines/weekly-report.routine.yaml`, and Make live answers what Create version answered.
- Given a routine at the workspace's root, `daily`, then Create version opens with only `workflows/routines/daily.routine.yaml`.
- Given the app has no Create version to open, then the routines have no Make live.
