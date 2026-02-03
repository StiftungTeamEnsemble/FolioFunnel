import { Prisma } from "@prisma/client";
import prisma from "@/lib/db";

export type FilterOperator = "contains" | "equals" | "lt" | "gt";
export type FilterJoin = "and" | "or";

export interface FilterRule {
  id: string;
  field: string;
  operator: FilterOperator;
  value: string;
}

export interface FilterGroup {
  id: string;
  join: FilterJoin;
  rules: FilterRule[];
}

const numericRegex = "^-?\\d+(\\.\\d+)?$";

const normalizeInput = (value: string) => value.trim();

const buildTextCondition = (
  expression: Prisma.Sql,
  operator: FilterOperator,
  input: string,
) => {
  if (operator === "contains") {
    return Prisma.sql`lower(${expression}) ILIKE ${`%${input.toLowerCase()}%`}`;
  }

  if (operator === "equals") {
    return Prisma.sql`lower(${expression}) = ${input.toLowerCase()}`;
  }

  return null;
};

const buildNumericCondition = (
  expression: Prisma.Sql,
  operator: FilterOperator,
  input: string,
) => {
  const numericValue = Number(input);
  if (!Number.isFinite(numericValue)) {
    return null;
  }

  const textExpression = Prisma.sql`(${expression})::text`;
  const numericExpression = Prisma.sql`CASE WHEN ${textExpression} ~ ${numericRegex} THEN (${textExpression})::numeric END`;

  if (operator === "lt") {
    return Prisma.sql`${numericExpression} < ${numericValue}`;
  }

  if (operator === "gt") {
    return Prisma.sql`${numericExpression} > ${numericValue}`;
  }

  return null;
};

const buildDateCondition = (
  expression: Prisma.Sql,
  operator: FilterOperator,
  input: string,
) => {
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  if (operator === "lt") {
    return Prisma.sql`${expression} < ${parsed}`;
  }

  if (operator === "gt") {
    return Prisma.sql`${expression} > ${parsed}`;
  }

  return null;
};

const buildRuleCondition = (rule: FilterRule) => {
  const input = normalizeInput(rule.value);
  if (!input) {
    return null;
  }

  if (rule.field === "all") {
    if (rule.operator !== "contains" && rule.operator !== "equals") {
      return null;
    }

    const term =
      rule.operator === "contains"
        ? `%${input.toLowerCase()}%`
        : input.toLowerCase();

    if (rule.operator === "contains") {
      return Prisma.sql`(
        lower(coalesce(documents.title, '')) ILIKE ${term}
        OR lower(coalesce(documents.source_url, '')) ILIKE ${term}
        OR lower(documents.source_type::text) ILIKE ${term}
        OR lower(documents.values::text) ILIKE ${term}
        OR lower(to_char(documents.created_at, 'YYYY-MM-DD HH24:MI:SS')) ILIKE ${term}
      )`;
    }

    return Prisma.sql`(
      lower(coalesce(documents.title, '')) = ${term}
      OR lower(coalesce(documents.source_url, '')) = ${term}
      OR lower(documents.source_type::text) = ${term}
      OR lower(documents.values::text) = ${term}
      OR lower(to_char(documents.created_at, 'YYYY-MM-DD HH24:MI:SS')) = ${term}
    )`;
  }

  let expression: Prisma.Sql;
  if (rule.field === "title") {
    expression = Prisma.sql`documents.title`;
  } else if (rule.field === "source") {
    expression = Prisma.sql`concat(documents.source_type::text, ' ', coalesce(documents.source_url, ''))`;
  } else if (rule.field === "created") {
    expression = Prisma.sql`documents.created_at`;
  } else if (rule.field.startsWith("column:")) {
    const key = rule.field.replace("column:", "");
    expression = Prisma.sql`documents.values ->> ${key}`;
  } else {
    return null;
  }

  if (rule.field === "created") {
    const dateCondition = buildDateCondition(expression, rule.operator, input);
    if (dateCondition) return dateCondition;

    return buildTextCondition(
      Prisma.sql`to_char(documents.created_at, 'YYYY-MM-DD HH24:MI:SS')`,
      rule.operator,
      input,
    );
  }

  const numericCondition = buildNumericCondition(
    expression,
    rule.operator,
    input,
  );
  if (numericCondition) {
    return numericCondition;
  }

  return buildTextCondition(expression, rule.operator, input);
};

export const buildDocumentFilterSql = (filters: FilterGroup[]) => {
  if (!filters.length) return null;

  const groupConditions = filters
    .map((group) => {
      const ruleConditions = group.rules
        .map(buildRuleCondition)
        .filter(Boolean) as Prisma.Sql[];

      if (!ruleConditions.length) {
        return null;
      }

      const joiner = group.join === "or" ? " OR " : " AND ";

      return Prisma.sql`(${Prisma.join(ruleConditions, joiner)})`;
    })
    .filter(Boolean) as Prisma.Sql[];

  if (!groupConditions.length) {
    return null;
  }

  return Prisma.sql`${Prisma.join(groupConditions, " AND ")}`;
};

export async function getFilteredDocumentIds(
  projectId: string,
  filters: FilterGroup[],
) {
  const filterSql = buildDocumentFilterSql(filters);

  const rows = await prisma.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`
      SELECT id
      FROM documents
      WHERE project_id = ${projectId}::uuid
      ${filterSql ? Prisma.sql`AND ${filterSql}` : Prisma.empty}
      ORDER BY created_at DESC
    `,
  );

  return rows.map((row) => row.id);
}
