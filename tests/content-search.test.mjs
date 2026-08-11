import assert from "node:assert/strict";
import test from "node:test";
import { ContentStore } from "../dist/content.js";
import { TavoSearchIndex } from "../dist/search.js";

test("loads the versioned public manifest and exposes its inventory", async () => {
  const store = await ContentStore.load();
  assert.equal(store.manifest.schemaVersion, 1);
  assert.equal(store.manifest.documents.length, 121);
  assert.equal(store.manifest.components.length, 80);
  assert.ok(store.apiRecords.length > 100);
  assert.ok(
    store.manifest.sources.every((source) => source.kind !== "product"),
  );
});

test("preserves task metadata and rich public API contracts", async () => {
  const store = await ContentStore.load();
  const firstApp = store.documentsById.get("getting-started:first-app");
  assert.equal(firstApp.kind, "quickstart");
  assert.ok(firstApp.prerequisites.length > 0);
  assert.ok(firstApp.outcomes.length > 0);
  assert.deepEqual(firstApp.runtime, ["browser", "server", "build"]);
  assert.ok(firstApp.related.some((item) => item.href.startsWith("/docs/")));

  const buildTheme = store.apiRecords.find(
    (record) =>
      record.entrypoint === "@tavojs/ui/theme" && record.name === "buildTheme",
  );
  assert.match(buildTheme.signature, /ThemeBuildResult/);
  assert.deepEqual(buildTheme.runtime, ["browser", "server"]);
  assert.equal(buildTheme.related, "/docs/ui/theming");
});

test("excludes retired components and private web UI APIs", async () => {
  const store = await ContentStore.load();
  assert.equal(store.componentsBySlug.has("carousel"), false);

  const retiredSymbols = new Set([
    "useTheme",
    "ThemeShade",
    "ThemeTokenBuildResult",
    "auditComponentA11yMetadata",
    "auditTavoUiA11y",
  ]);
  assert.equal(
    store.apiRecords.some(
      (record) => record.package === "ui" && retiredSymbols.has(record.name),
    ),
    false,
  );
  assert.ok(
    store.apiRecords.some(
      (record) =>
        record.entrypoint === "@tavojs/ui/a11y" &&
        record.name === "auditThemeA11y",
    ),
  );
});

test("finds canonical Tavo.js APIs and UI components", async () => {
  const store = await ContentStore.load();
  const search = new TavoSearchIndex(store);

  const routeResults = search.search("defineRoutePage route page", "api", 5);
  assert.ok(routeResults.some((result) => result.title === "defineRoutePage"));

  const componentResults = search.search(
    "submit action button",
    "components",
    5,
  );
  assert.ok(componentResults.some((result) => result.title === "Button"));

  const quickstartResults = search.search(
    "project dashboard first app",
    "docs",
    5,
  );
  assert.ok(
    quickstartResults.some(
      (result) => result.id === "docs:getting-started:first-app",
    ),
  );

  const signatureResults = search.search("ThemeBuildResult", "api", 5);
  assert.ok(signatureResults.some((result) => result.title === "buildTheme"));
});

test("limits result counts and supports scoped searches", async () => {
  const search = new TavoSearchIndex(await ContentStore.load());
  const results = search.search("theme", "tokens", 3);
  assert.ok(results.length <= 3);
  assert.ok(results.every((result) => result.scope === "tokens"));
});

test("filters API packages before applying the result limit", async () => {
  const search = new TavoSearchIndex(await ContentStore.load());

  const core = search.search("public export", "api", 1, { package: "core" });
  const ui = search.search("public export", "api", 1, { package: "ui" });

  assert.equal(core.length, 1);
  assert.equal(core[0].value.package, "core");
  assert.equal(ui.length, 1);
  assert.equal(ui[0].value.package, "ui");
});

test("ranks exact API and component names ahead of partial matches", async () => {
  const search = new TavoSearchIndex(await ContentStore.load());

  assert.equal(
    search.search("defineRoutePage", "api", 1)[0].title,
    "defineRoutePage",
  );
  assert.equal(search.search("Button", "components", 1)[0].title, "Button");
  assert.equal(
    search.search("primary action", "components", 1)[0].title,
    "Button",
  );
});
