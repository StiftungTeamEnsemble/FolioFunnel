import { ProcessorContext, ProcessorResult } from "./index";
import { pdfToMetadata } from "./pdf-to-metadata";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

// Private IP ranges to block (SSRF protection)
const PRIVATE_IP_RANGES = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^localhost$/i,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
];

const MAX_DOWNLOAD_SIZE = 10 * 1024 * 1024; // 10MB
const FETCH_TIMEOUT = 30000; // 30 seconds
const ALLOWED_CONTENT_TYPES = [
  "text/html",
  "text/plain",
  "application/xhtml+xml",
];

interface DocumentMetadataConfig {
  metadataField?: string;
}

type MetadataResult = Record<string, string | null | undefined>;

function isPrivateUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    for (const pattern of PRIVATE_IP_RANGES) {
      if (pattern.test(hostname)) {
        return true;
      }
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
      return true;
    }

    return false;
  } catch {
    return true;
  }
}

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  const response = await fetch(url, {
    signal: controller.signal,
    headers: {
      "User-Agent": "FolioFunnel/1.0 (Document Processor)",
      Accept: "text/html,application/xhtml+xml,text/plain",
    },
  });

  clearTimeout(timeoutId);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch URL: ${response.status} ${response.statusText}`,
    );
  }

  const contentType = response.headers.get("content-type") || "";
  const isAllowedType = ALLOWED_CONTENT_TYPES.some((type) =>
    contentType.includes(type),
  );

  if (!isAllowedType) {
    throw new Error(`Unsupported content type: ${contentType}`);
  }

  const contentLength = response.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > MAX_DOWNLOAD_SIZE) {
    throw new Error(`Content too large: ${contentLength} bytes`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Failed to read response body");
  }

  const chunks: Uint8Array[] = [];
  let totalSize = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    totalSize += value.length;
    if (totalSize > MAX_DOWNLOAD_SIZE) {
      reader.cancel();
      throw new Error("Content too large");
    }

    chunks.push(value);
  }

  return new TextDecoder().decode(
    new Uint8Array(
      chunks.reduce((acc, chunk) => [...acc, ...chunk], [] as number[]),
    ),
  );
}

function buildMetaMap(dom: JSDOM): Map<string, string> {
  const metaMap = new Map<string, string>();
  const metaTags = Array.from(dom.window.document.querySelectorAll("meta"));

  metaTags.forEach((tag) => {
    const name = tag.getAttribute("name")?.toLowerCase();
    const property = tag.getAttribute("property")?.toLowerCase();
    const content = tag.getAttribute("content");

    if (!content) return;

    if (name) {
      metaMap.set(name, content);
    }

    if (property) {
      metaMap.set(property, content);
    }
  });

  return metaMap;
}

function getMetaValue(
  metaMap: Map<string, string>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = metaMap.get(key.toLowerCase());
    if (value) return value;
  }
  return undefined;
}

function extractUrlMetadata(html: string, url: string): MetadataResult {
  const dom = new JSDOM(html, { url });
  const readability = new Readability(dom.window.document);
  const article = readability.parse();
  const metaMap = buildMetaMap(dom);

  const title =
    article?.title ||
    getMetaValue(metaMap, ["og:title", "twitter:title"]) ||
    dom.window.document.title ||
    undefined;

  const metadata: MetadataResult = {
    title,
    author: getMetaValue(metaMap, ["author", "article:author", "dc.creator"]),
    subject: getMetaValue(metaMap, [
      "subject",
      "description",
      "og:description",
      "twitter:description",
      "dc.description",
    ]),
    keywords: getMetaValue(metaMap, [
      "keywords",
      "news_keywords",
      "article:tag",
    ]),
    creator: getMetaValue(metaMap, ["creator", "dc.creator"]),
    producer: getMetaValue(metaMap, ["producer"]),
    creationDate: getMetaValue(metaMap, [
      "creation_date",
      "creationdate",
      "date",
      "article:published_time",
      "dc.date",
    ]),
    modDate: getMetaValue(metaMap, [
      "mod_date",
      "modified",
      "last-modified",
      "article:modified_time",
      "dc.modified",
    ]),
    format: getMetaValue(metaMap, ["format", "dc.format"]),
    pageCount: getMetaValue(metaMap, ["pagecount", "page_count"]),
  };

  return metadata;
}

export async function documentToMetadata(
  ctx: ProcessorContext,
): Promise<ProcessorResult> {
  const { document, column } = ctx;

  if (document.sourceType === "upload") {
    if (document.mimeType !== "application/pdf") {
      return { success: false, error: "Document is not a PDF" };
    }
    return pdfToMetadata(ctx);
  }

  if (document.sourceType !== "url") {
    return {
      success: false,
      error:
        "Document to Metadata processor only works with PDF or URL documents",
    };
  }

  if (!document.sourceUrl) {
    return { success: false, error: "No URL found for document" };
  }

  if (isPrivateUrl(document.sourceUrl)) {
    return {
      success: false,
      error: "URL points to a private/internal address",
    };
  }

  const config = (column.processorConfig as DocumentMetadataConfig) || {};
  const metadataField = config.metadataField || "title";

  const startTime = Date.now();

  try {
    const html = await fetchHtml(document.sourceUrl);
    const metadata = extractUrlMetadata(html, document.sourceUrl);
    const duration = Date.now() - startTime;

    return {
      success: true,
      value: metadata[metadataField] ?? null,
      meta: {
        duration,
        field: metadataField,
        allMetadata: metadata,
      },
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { success: false, error: "Request timed out" };
    }

    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to fetch URL metadata",
    };
  }
}
