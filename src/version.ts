import { createRequire } from "node:module";

type PackageMetadata = {
  version?: unknown;
};

const require = createRequire(import.meta.url);

/** The version declared by the package that contains this module. */
export function getPackageVersion(): string {
  const metadata = require("../package.json") as PackageMetadata;
  if (typeof metadata.version !== "string" || metadata.version.length === 0) {
    throw new Error("@tavojs/mcp package.json has no valid version.");
  }
  return metadata.version;
}

export const packageVersion = getPackageVersion();
