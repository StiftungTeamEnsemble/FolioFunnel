import { ProcessorContext, ProcessorResult } from "./index";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";
import { getDocumentDir } from "@/lib/storage";
import { readFile } from "fs/promises";
import path from "path";

export async function urlToMarkdown(
  ctx: ProcessorContext,
): Promise<ProcessorResult> {
  const { document, projectId } = ctx;

  // Only works for URL documents
  if (document.sourceType !== "url") {
    return {
      success: false,
      error: "URL to Markdown processor only works with URL documents",
    };
  }

  if (!document.sourceUrl) {
    return { success: false, error: "No URL found for document" };
  }

  const startTime = Date.now();

  try {
    // Read the stored HTML file
    const documentDir = getDocumentDir(projectId, document.id);
    const htmlPath = path.join(documentDir, "source.html");

    let html: string;
    try {
      html = await readFile(htmlPath, "utf-8");
    } catch (error) {
      return {
        success: false,
        error: "HTML file not found. Please run url_to_html processor first.",
      };
    }

    // Parse with JSDOM and Readability
    const dom = new JSDOM(html, { url: document.sourceUrl });
    const readability = new Readability(dom.window.document);
    const article = readability.parse();

    if (!article) {
      return {
        success: false,
        error: "Could not extract readable content from HTML",
      };
    }

    // Convert HTML content to Markdown using Turndown
    const turndownService = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
      bulletListMarker: "-",
      emDelimiter: "*",
      strongDelimiter: "**",
      linkStyle: "inlined",
    });

    // Add rules for common elements
    turndownService.addRule("strikethrough", {
      filter: ["del", "s", "strike" as any],
      replacement: (content) => `~~${content}~~`,
    });

    const markdownContent = turndownService.turndown(article.content || "");

    // Build final markdown with frontmatter-like header
    const markdown = [
      `# ${article.title || document.title}`,
      "",
      article.byline ? `*${article.byline}*` : "",
      article.excerpt ? `> ${article.excerpt}` : "",
      "",
      markdownContent,
    ]
      .filter(Boolean)
      .join("\n");

    const duration = Date.now() - startTime;

    return {
      success: true,
      value: markdown.trim(),
      meta: {
        duration,
        title: article.title,
        byline: article.byline,
        excerpt: article.excerpt,
        markdownLength: markdown.length,
        siteName: article.siteName,
      },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to convert HTML to Markdown",
    };
  }
}
