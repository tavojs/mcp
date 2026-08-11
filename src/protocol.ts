export const MIN_TOOL_TOKENS = 256;
export const DEFAULT_TOOL_TOKENS = 2_048;
export const MAX_TOOL_TOKENS = 8_192;

export type Continuation = {
  resourceUri: string;
  nextSection?: string | undefined;
};

export type TavoMcpEnvelope<T> = {
  schemaVersion: 1;
  ok: boolean;
  data: T;
  sources: Array<{ uri: string; title: string }>;
  diagnostics: Array<{
    code: string;
    level: "error" | "warning";
    message: string;
  }>;
  meta: {
    truncated: boolean;
    estimatedTokens: number;
    maxTokens: number;
    continuation?: Continuation | undefined;
  };
};

export type EnvelopeOptions = {
  maxTokens?: number | undefined;
  continuation?: Continuation | undefined;
};

export function normalizeTokenBudget(value?: number): number {
  if (value === undefined) return DEFAULT_TOOL_TOKENS;
  if (
    !Number.isInteger(value) ||
    value < MIN_TOOL_TOKENS ||
    value > MAX_TOOL_TOKENS
  ) {
    throw new Error(
      `maxTokens must be an integer between ${MIN_TOOL_TOKENS} and ${MAX_TOOL_TOKENS}.`,
    );
  }
  return value;
}

export function estimateTokens(value: unknown): number {
  return Math.ceil(JSON.stringify(value).length / 4);
}

function compactValue(
  value: unknown,
  maxStringLength: number,
  maxArrayLength: number,
): unknown {
  if (typeof value === "string") {
    if (value.length <= maxStringLength) return value;
    if (maxStringLength === 0) return "";
    return `${value.slice(0, Math.max(0, maxStringLength - 1))}…`;
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, maxArrayLength)
      .map((item) => compactValue(item, maxStringLength, maxArrayLength));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        compactValue(item, maxStringLength, maxArrayLength),
      ]),
    );
  }
  return value;
}

function buildEnvelope<T>(
  data: T,
  sources: Array<{ uri: string; title: string }>,
  maxTokens: number,
  truncated: boolean,
  continuation?: Continuation,
): TavoMcpEnvelope<T> {
  const meta = {
    truncated,
    estimatedTokens: 0,
    maxTokens,
    ...(truncated && continuation ? { continuation } : {}),
  };
  const result: TavoMcpEnvelope<T> = {
    schemaVersion: 1,
    ok: true,
    data,
    sources,
    diagnostics: [],
    meta,
  };
  meta.estimatedTokens = estimateTokens(result);
  return result;
}

export function envelope<T>(
  data: T,
  sources: Array<{ uri: string; title: string }> = [],
  options: EnvelopeOptions = {},
): TavoMcpEnvelope<T> {
  const maxTokens = normalizeTokenBudget(options.maxTokens);
  const full = buildEnvelope(data, sources, maxTokens, false);
  if (full.meta.estimatedTokens <= maxTokens) return full;

  const reductions = [
    { maxStringLength: 4_096, maxArrayLength: 50 },
    { maxStringLength: 2_048, maxArrayLength: 20 },
    { maxStringLength: 1_024, maxArrayLength: 10 },
    { maxStringLength: 512, maxArrayLength: 5 },
    { maxStringLength: 256, maxArrayLength: 3 },
    { maxStringLength: 128, maxArrayLength: 1 },
    { maxStringLength: 64, maxArrayLength: 0 },
    { maxStringLength: 0, maxArrayLength: 0 },
  ];
  for (const reduction of reductions) {
    const compacted = compactValue(
      data,
      reduction.maxStringLength,
      reduction.maxArrayLength,
    ) as T;
    const compactedSources = compactValue(
      sources,
      reduction.maxStringLength,
      reduction.maxArrayLength,
    ) as Array<{ uri: string; title: string }>;
    const candidate = buildEnvelope(
      compacted,
      compactedSources,
      maxTokens,
      true,
      options.continuation,
    );
    if (candidate.meta.estimatedTokens <= maxTokens) return candidate;
  }

  // The minimum budget is deliberately large enough for the fixed envelope.
  // If a future schema makes that untrue, fail rather than misreport the limit.
  throw new Error(`Unable to fit the tool result within ${maxTokens} tokens.`);
}

export function failure(
  code: string,
  message: string,
  maxTokens = DEFAULT_TOOL_TOKENS,
): TavoMcpEnvelope<null> {
  const normalizedBudget = normalizeTokenBudget(maxTokens);
  let boundedMessage = message;
  const result: TavoMcpEnvelope<null> = {
    schemaVersion: 1,
    ok: false,
    data: null,
    sources: [],
    diagnostics: [{ code, level: "error", message: boundedMessage }],
    meta: {
      truncated: false,
      estimatedTokens: 0,
      maxTokens: normalizedBudget,
    },
  };
  result.meta.estimatedTokens = estimateTokens(result);
  while (
    result.meta.estimatedTokens > normalizedBudget &&
    boundedMessage.length > 32
  ) {
    boundedMessage = `${boundedMessage.slice(0, Math.floor(boundedMessage.length / 2))}…`;
    result.diagnostics[0]!.message = boundedMessage;
    result.meta.truncated = true;
    result.meta.estimatedTokens = estimateTokens(result);
  }
  return result;
}
