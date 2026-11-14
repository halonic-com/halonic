// Downloads MXC's SDK into Halonic's data folder: `node src/fetch-sdk.ts <data folder>`.
// The MXC fence job runs it before the fence tests, so CI takes the same
// download path as a user's computer.

import { downloadMxcSdk, sdkFolderOf } from "./sdk-download.ts";

const dataFolder = process.argv[2];
if (dataFolder === undefined) {
  console.error("usage: node src/fetch-sdk.ts <data folder>");
  process.exit(2);
}
await downloadMxcSdk(sdkFolderOf(dataFolder));
console.log(`MXC's SDK is in ${sdkFolderOf(dataFolder)}`);
