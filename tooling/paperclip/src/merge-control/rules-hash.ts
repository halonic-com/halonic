/**
 * Stands for the merge rules bundle's own hash until `build:plugin` writes
 * the file: the build hashes the bundle with this text in it, then puts the
 * hash here. Kept in a module with no imports, so the build that writes
 * `dist/manifest.js` doesn't run the merge rules' code (HAL-19527).
 */
export const rulesHashPlaceholder = "rules-hash-placeholder";
