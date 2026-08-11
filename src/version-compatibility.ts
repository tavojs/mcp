import type { ContentStore } from "./content.js";
import type { InstalledTavoPackages } from "./tavo-cli.js";

export type VersionCompatibilityCheck = {
  packageName: keyof InstalledTavoPackages;
  installedVersion: string | null;
  documentationSource: string;
  documentationVersion: string | null;
  status: "match" | "mismatch" | "unavailable";
};

export type DocumentationCompatibility = {
  status: "compatible" | "mismatch" | "unavailable" | "not-configured";
  contentHash: string;
  checks: VersionCompatibilityCheck[];
  warnings: string[];
};

const SOURCE_BY_PACKAGE: Record<
  keyof InstalledTavoPackages,
  "cli" | "framework" | "ui"
> = {
  "@tavojs/cli": "cli",
  "@tavojs/core": "framework",
  "@tavojs/ui": "ui",
};

export function documentationCompatibility(
  store: ContentStore,
  installedPackages?: InstalledTavoPackages,
): DocumentationCompatibility {
  if (!installedPackages) {
    return {
      status: "not-configured",
      contentHash: store.manifest.contentHash,
      checks: [],
      warnings: [],
    };
  }

  const checks = Object.entries(installedPackages).map(
    ([packageName, installedVersion]) => {
      const name = packageName as keyof InstalledTavoPackages;
      const source = store.manifest.sources.find(
        (candidate) => candidate.kind === SOURCE_BY_PACKAGE[name],
      );
      const documentationVersion = source?.version ?? null;
      const status =
        !installedVersion || !documentationVersion
          ? "unavailable"
          : installedVersion === documentationVersion
            ? "match"
            : "mismatch";
      return {
        packageName: name,
        installedVersion,
        documentationSource: source?.id ?? SOURCE_BY_PACKAGE[name],
        documentationVersion,
        status,
      } satisfies VersionCompatibilityCheck;
    },
  );
  const warnings = checks
    .filter((check) => check.status === "mismatch")
    .map(
      (check) =>
        `Installed ${check.packageName}@${check.installedVersion} does not match the bundled ${check.documentationSource}@${check.documentationVersion} documentation snapshot. Verify APIs against the installed package before editing.`,
    );

  return {
    status: warnings.length
      ? "mismatch"
      : checks.some((check) => check.status === "match")
        ? "compatible"
        : "unavailable",
    contentHash: store.manifest.contentHash,
    checks,
    warnings,
  };
}
