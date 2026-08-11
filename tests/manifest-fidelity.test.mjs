import assert from "node:assert/strict";
import test from "node:test";
import { ContentStore } from "../dist/content.js";

const malformedCodePatterns = [
  { pattern: /\.tsts\b/, label: "duplicated TypeScript extension (.tsts)" },
  { pattern: /\.tsxtsx\b/, label: "duplicated TSX extension (.tsxtsx)" },
  {
    pattern: /\bTerminal(?:bash|sh|zsh)\b/,
    label: "terminal label joined to its language",
  },
  {
    pattern: /\b(?:tsx?|jsx?|bash|sh|zsh)``/,
    label: "language joined to doubled backticks",
  },
  {
    pattern: /^(?:tsx?|jsx?|bash|sh|zsh)`[^`\n]+`/m,
    label: "language joined to an inline code block",
  },
];

test("preserves valid Markdown code blocks in every documentation section", async () => {
  const { manifest } = await ContentStore.load();
  const failures = [];

  for (const document of manifest.documents) {
    for (const section of document.sections) {
      const location = `${document.id}#${section.id}`;
      const fenceCount = section.markdown.match(/^```/gm)?.length ?? 0;
      if (fenceCount % 2 !== 0) {
        failures.push(`${location}: unbalanced fenced code blocks`);
      }

      for (const { pattern, label } of malformedCodePatterns) {
        if (pattern.test(section.markdown)) {
          failures.push(`${location}: ${label}`);
        }
      }
    }
  }

  assert.deepEqual(failures, []);
});
