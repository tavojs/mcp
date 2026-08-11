import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_TOOL_TOKENS,
  envelope,
  estimateTokens,
  failure,
  normalizeTokenBudget,
} from "../dist/protocol.js";

test("keeps complete results inside the default token budget", () => {
  const value = envelope({ message: "small" });
  assert.equal(value.meta.truncated, false);
  assert.equal(value.meta.maxTokens, DEFAULT_TOOL_TOKENS);
  assert.equal(value.meta.estimatedTokens, estimateTokens(value));
});

test("truncates large nested results without exceeding the requested budget", () => {
  const value = envelope(
    {
      sections: Array.from({ length: 20 }, (_, index) => ({
        id: `section-${index}`,
        markdown: "documentation ".repeat(1_000),
      })),
    },
    [{ uri: "tavo://docs/core", title: "Core" }],
    {
      maxTokens: 512,
      continuation: {
        resourceUri: "tavo://docs/core",
        nextSection: "section-1",
      },
    },
  );
  assert.equal(value.meta.truncated, true);
  assert.ok(value.meta.estimatedTokens <= 512);
  assert.equal(value.meta.continuation.resourceUri, "tavo://docs/core");
  assert.ok(value.data.sections.length < 20);
});

test("rejects unsafe token budgets", () => {
  assert.throws(() => normalizeTokenBudget(255), /between 256 and 8192/);
  assert.throws(() => normalizeTokenBudget(8_193), /between 256 and 8192/);
});

test("bounds diagnostic failures too", () => {
  const value = failure(
    "cli-failed",
    "private failure detail ".repeat(500),
    256,
  );
  assert.equal(value.ok, false);
  assert.equal(value.meta.truncated, true);
  assert.ok(value.meta.estimatedTokens <= 256);
});
