import { ProcessorContext, ProcessorResult } from "./index";
import { readFile } from "@/lib/storage";

const DOCUMENT_CONVERTER_API_URL =
  process.env.DOCUMENT_CONVERTER_API_URL || "http://document-converter:8180";
const DOCUMENT_CONVERTER_API_KEY =
  process.env.DOCUMENT_CONVERTER_API_KEY || "converter_secret_key";

// Available metadata fields
export const PDF_METADATA_FIELDS = [
  { key: "title", label: "Title" },
  { key: "author", label: "Author" },
  { key: "subject", label: "Subject" },
  { key: "keywords", label: "Keywords" },
  { key: "creator", label: "Creator" },
  { key: "producer", label: "Producer" },
  { key: "creationDate", label: "Creation Date" },
  { key: "modDate", label: "Modification Date" },
  { key: "pageCount", label: "Page Count" },
  { key: "format", label: "Format" },
] as const;

export type PdfMetadataField = (typeof PDF_METADATA_FIELDS)[number]["key"];

interface PdfMetadataConfig {
  metadataField?: PdfMetadataField;
}

export async function pdfToMetadata(
  ctx: ProcessorContext,
): Promise<ProcessorResult> {
  const { document, column } = ctx;

  // Only works for uploaded PDFs
  if (document.sourceType !== "upload") {
    return {
      success: false,
      error: "PDF to Metadata processor only works with uploaded documents",
    };
  }

  if (!document.filePath) {
    return { success: false, error: "No file path found for document" };
  }

  if (document.mimeType !== "application/pdf") {
    return { success: false, error: "Document is not a PDF" };
  }

  const config = (column.processorConfig as PdfMetadataConfig) || {};
  const metadataField = config.metadataField || "pageCount";

  const startTime = Date.now();

  try {
    // Read the PDF file
    const fileBuffer = await readFile(document.filePath);

    // Create form data
    const formData = new FormData();
    const blob = new Blob([fileBuffer as any], { type: "application/pdf" });
    formData.append("file", blob, "document.pdf");
    formData.append("fields", JSON.stringify([metadataField]));

    // Call document converter API metadata endpoint
    const response = await fetch(
      `${DOCUMENT_CONVERTER_API_URL}/extract-metadata`,
      {
        method: "POST",
        headers: {
          "X-API-Key": DOCUMENT_CONVERTER_API_KEY,
        },
        body: formData,
      },
    );

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: "Unknown error" }));
      return {
        success: false,
        error: `Document converter API error: ${error.error || response.statusText}`,
      };
    }

    const result = await response.json();

    if (!result.success) {
      return {
        success: false,
        error: result.error || "Metadata extraction failed",
      };
    }

    const duration = Date.now() - startTime;
    const extractedValue = result.metadata[metadataField];

    return {
      success: true,
      value: extractedValue,
      meta: {
        duration,
        field: metadataField,
        allMetadata: result.metadata,
      },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to extract PDF metadata",
    };
  }
}
