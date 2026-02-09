import fs from "node:fs/promises";
import path from "node:path";

const usage = `
Usage:
  node scripts/update-tags-from-csv.mjs <path-to-csv> [--has-header]

Required environment variables:
  FF_BASE_URL=http://localhost:3000
  FF_PROJECT_ID=<project-id>
  FF_SESSION_COOKIE="next-auth.session-token=...; next-auth.csrf-token=..."

Example:
  npx dotenv-cli -e ./scripts/.env -- node scripts/update-tags-from-csv.mjs ./scripts/finder_tags_export.csv --has-header > __logs.txt
`;


const parseArgs = (argv) => {
  const args = argv.slice(2);
  const options = { hasHeader: false, csvPath: "" };

  for (const arg of args) {
    if (arg === "--has-header") {
      options.hasHeader = true;
    } else if (!options.csvPath) {
      options.csvPath = arg;
    }
  }

  return options;
};

const parseCsv = (content) => {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === "\t") {
      row.push(field);
      field = "";
      continue;
    }

    if (char === "\n" || char === "\r") {
      if (char === "\r" && nextChar === "\n") {
        i += 1;
      }
      row.push(field);
      if (row.some((value) => value.trim() !== "")) {
        rows.push(row);
      }
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  row.push(field);
  if (row.some((value) => value.trim() !== "")) {
    rows.push(row);
  }

  return rows;
};

const buildFilters = (title) => [
  {
    id: "group-1",
    join: "and",
    rules: [
      {
        id: "rule-1",
        field: "title",
        operator: "equals",
        value: title,
      },
    ],
  },
];

const main = async () => {
  const { csvPath, hasHeader } = parseArgs(process.argv);
  if (!csvPath) {
    console.error(usage.trim());
    process.exit(1);
  }

  const baseUrl = process.env.FF_BASE_URL ?? "http://localhost:3000";
  const projectId = process.env.FF_PROJECT_ID;
  const sessionCookie = process.env.FF_SESSION_COOKIE;

  if (!projectId || !sessionCookie) {
    console.error(
      "Missing FF_PROJECT_ID or FF_SESSION_COOKIE. See usage instructions.",
    );
    console.error(usage.trim());
    process.exit(1);
  }

  const absolutePath = path.resolve(csvPath);
  const csvContent = await fs.readFile(absolutePath, "utf-8");
  const rows = parseCsv(csvContent);
  if (hasHeader) {
    rows.shift();
  }

  let errorCount = 0;

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const lineNumber = hasHeader ? index + 2 : index + 1;
    const filename = row[0]?.trim();
    const tagsField = row.length > 1 ? row.slice(1).join(",") : "";

    if (!filename) {
      console.error(`Line ${lineNumber}: Missing filename`);
      errorCount += 1;
      continue;
    }

    const tags = tagsField
      .split(";")
      .map((tag) => tag.trim())
      .filter(Boolean);

    const searchResponse = await fetch(
      `${baseUrl}/api/projects/${projectId}/documents/search`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: sessionCookie,
        },
        body: JSON.stringify({
          filters: buildFilters(filename),
        }),
      },
    );

    if (!searchResponse.ok) {
      console.error(
        `Line ${lineNumber}: Failed to search "${filename}" (${searchResponse.status})`,
      );
      errorCount += 1;
      continue;
    }

    const searchData = await searchResponse.json();
    const documents = Array.isArray(searchData.documents)
      ? searchData.documents
      : [];

    if (documents.length !== 1) {
      console.error(
        `Line ${lineNumber}: Expected 1 document for "${filename}", found ${documents.length}`,
      );
      errorCount += 1;
      continue;
    }

    const documentId = documents[0].id;
    const updateResponse = await fetch(
      `${baseUrl}/api/projects/${projectId}/documents/${documentId}/values`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          cookie: sessionCookie,
        },
        body: JSON.stringify({
          columnKey: "tags",
          value: tags,
        }),
      },
    );

    if (!updateResponse.ok) {
      console.error(
        `Line ${lineNumber}: Failed to update tags for "${filename}" (${updateResponse.status})`,
      );
      errorCount += 1;
      continue;
    }

    console.log(
      `Line ${lineNumber}: Updated "${filename}" with ${tags.length} tags`,
    );
  }

  if (errorCount > 0) {
    console.error(`Completed with ${errorCount} error(s).`);
    process.exit(1);
  }
};

main().catch((error) => {
  console.error("Script failed:", error);
  process.exit(1);
});
