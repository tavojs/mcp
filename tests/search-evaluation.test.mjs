import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ContentStore } from "../dist/content.js";
import { TavoSearchIndex } from "../dist/search.js";

const corpusPath = new URL(
  "./fixtures/search-evaluation.json",
  import.meta.url,
);

test("representative Tavo.js intents retain top-five recall and first-result relevance", async () => {
  const corpus = JSON.parse(await readFile(corpusPath, "utf8"));
  const search = new TavoSearchIndex(await ContentStore.load());
  const misses = [];
  const rankRegressions = [];

  for (const evaluation of corpus) {
    const results = search.search(
      evaluation.query,
      evaluation.scope,
      5,
      evaluation.filters,
    );
    const rank =
      results.findIndex((result) => result.id === evaluation.expectedId) + 1;
    if (rank === 0) {
      misses.push({
        area: evaluation.area,
        results: results.map(({ id }) => id),
      });
    } else if (rank > evaluation.expectedRank) {
      rankRegressions.push({
        area: evaluation.area,
        expectedRank: evaluation.expectedRank,
        actualRank: rank,
      });
    }
  }

  assert.deepEqual(
    misses,
    [],
    "every representative intent must have top-five recall",
  );
  assert.deepEqual(
    rankRegressions,
    [],
    "canonical answers must retain their relevance rank",
  );
});
