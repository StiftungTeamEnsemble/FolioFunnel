import { ProcessorContext, ProcessorResult } from "./index";
import { readFile, writeFile, getDocumentThumbnailPath } from "@/lib/storage";
import { PDF_THUMBNAIL_FILENAME } from "@/lib/thumbnails";

const DOCUMENT_CONVERTER_API_URL =
  process.env.DOCUMENT_CONVERTER_API_URL || "http://document-converter:8080";
const DOCUMENT_CONVERTER_API_KEY =
  process.env.DOCUMENT_CONVERTER_API_KEY || "converter_secret_key";

export async function pdfToThumbnailMupdf(
  ctx: ProcessorContext,
): Promise<ProcessorResult> {
  const { document } = ctx;

  if (document.sourceType !== "upload") {
    return {
      success: false,
      error: "PDF thumbnail processor only works with uploaded documents",
    };
  }

  if (!document.filePath) {
    return { success: false, error: "No file path found for document" };
  }

  if (document.mimeType !== "application/pdf") {
    return { success: false, error: "Document is not a PDF" };
  }

  const startTime = Date.now();

  try {
    const fileBuffer = await readFile(document.filePath);

    const formData = new FormData();
    const blob = new Blob([fileBuffer], { type: "application/pdf" });
    formData.append("file", blob, "document.pdf");

    const response = await fetch(
      `${DOCUMENT_CONVERTER_API_URL}/generate-thumbnail`,
      {
        method: "POST",
        headers: {
          "X-API-Key": DOCUMENT_CONVERTER_API_KEY,
        },
        body: formData,
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Document converter API error: ${errorText || response.statusText}`,
      };
    }

    const imageBuffer = Buffer.from(await response.arrayBuffer());
    const thumbnailPath = getDocumentThumbnailPath(
      document.projectId,
      document.id,
    );

    await writeFile(thumbnailPath, imageBuffer);

    const duration = Date.now() - startTime;

    return {
      success: true,
      value: PDF_THUMBNAIL_FILENAME,
      meta: {
        duration,
        bytes: imageBuffer.length,
      },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to generate PDF thumbnail",
    };
  }
}
