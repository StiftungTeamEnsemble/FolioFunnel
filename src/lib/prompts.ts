import Handlebars from "handlebars";

const handlebars = Handlebars.create();

handlebars.registerHelper("truncate", (value: unknown, length: number) => {
  if (value === undefined || value === null) return "";
  const safeLength = Number(length);
  if (!Number.isFinite(safeLength) || safeLength <= 0) return "";

  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (text.length <= safeLength) return text;
  return text.slice(0, safeLength);
});

export function renderPromptTemplate(
  template: string,
  context: Record<string, unknown>,
): string {
  if (!template.trim()) return "";
  const compiledTemplate = handlebars.compile(template, { noEscape: true });
  return compiledTemplate(context);
}
