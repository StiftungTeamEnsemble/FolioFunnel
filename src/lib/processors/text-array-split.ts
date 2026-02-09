import { ProcessorContext, ProcessorResult } from "./index";

interface ReplacementRule {
  pattern: string;
  replacement?: string;
  flags?: string;
}

interface TextArraySplitConfig {
  sourceColumnKey: string;
  splitPattern?: string;
  splitFlags?: string;
  trimItems?: boolean;
  dropEmpty?: boolean;
  replacements?: ReplacementRule[];
}

const DEFAULT_SPLIT_PATTERN = String.raw`(?:\r?\n)(?=[*-]\s+)`;

function buildRegex(pattern: string, flags?: string): RegExp {
  return new RegExp(pattern, flags);
}

function normalizeReplacements(
  replacements: ReplacementRule[] | undefined,
): ReplacementRule[] {
  if (!Array.isArray(replacements)) {
    return [];
  }

  return replacements
    .filter((rule) => typeof rule?.pattern === "string")
    .map((rule) => ({
      pattern: rule.pattern,
      replacement: typeof rule.replacement === "string" ? rule.replacement : "",
      flags: typeof rule.flags === "string" ? rule.flags : "g",
    }))
    .filter((rule) => rule.pattern.trim().length > 0);
}

export async function textArraySplit(
  ctx: ProcessorContext,
): Promise<ProcessorResult> {
  const { document, column } = ctx;

  const config =
    (column.processorConfig as unknown as TextArraySplitConfig) || {};
  const sourceColumnKey = config.sourceColumnKey;

  if (!sourceColumnKey) {
    return {
      success: false,
      error: "Source column key is required for text_array_split processor",
    };
  }

  const values = (document.values as Record<string, unknown>) || {};
  const sourceText = values[sourceColumnKey];

  if (sourceText === undefined || sourceText === null) {
    return {
      success: true,
      value: [],
      meta: {
        note: "Source column is empty",
      },
    };
  }

  if (typeof sourceText !== "string") {
    return {
      success: false,
      error: `Source column "${sourceColumnKey}" is not a string`,
    };
  }

  const trimmedSource = sourceText.trim();
  if (!trimmedSource) {
    return {
      success: true,
      value: [],
      meta: {
        note: "Source column is empty",
      },
    };
  }

  const splitPattern =
    typeof config.splitPattern === "string" && config.splitPattern.trim()
      ? config.splitPattern
      : DEFAULT_SPLIT_PATTERN;
  const splitFlags =
    typeof config.splitFlags === "string" ? config.splitFlags : "";
  const trimItems = config.trimItems !== false;
  const dropEmpty = config.dropEmpty !== false;
  const replacements = normalizeReplacements(config.replacements);

  let splitRegex: RegExp;
  try {
    splitRegex = buildRegex(splitPattern, splitFlags);
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Invalid split regex pattern",
    };
  }

  let items = trimmedSource.split(splitRegex);

  if (trimItems) {
    items = items.map((item) => item.trim());
  }

  if (replacements.length > 0) {
    try {
      items = items.map((item) =>
        replacements.reduce((acc, rule) => {
          const regex = buildRegex(rule.pattern, rule.flags);
          return acc.replace(regex, rule.replacement ?? "");
        }, item),
      );
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Invalid replacement regex pattern",
      };
    }
  }

  if (trimItems) {
    items = items.map((item) => item.trim());
  }

  if (dropEmpty) {
    items = items.filter((item) => item.length > 0);
  }

  return {
    success: true,
    value: items,
    meta: {
      itemCount: items.length,
      splitPattern,
      splitFlags,
      replacements: replacements.length,
    },
  };
}
