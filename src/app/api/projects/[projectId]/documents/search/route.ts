import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireProjectAccess } from "@/lib/session";
import {
  getFilteredDocumentIds,
  type FilterGroup,
} from "@/lib/document-filters";
import { Prisma } from "@prisma/client";

type SortDirection = "asc" | "desc";
type SortState =
  | {
      type: "base";
      key: "title" | "source" | "uploader" | "created";
      direction: SortDirection;
    }
  | { type: "column"; key: string; direction: SortDirection };

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } },
) {
  try {
    await requireProjectAccess(params.projectId);
    const body = (await request.json().catch(() => ({}))) as {
      filters?: FilterGroup[];
      includeRuns?: boolean;
      sort?: SortState;
      page?: number;
      pageSize?: number;
    };

    const filters = Array.isArray(body.filters) ? body.filters : [];
    const includeRuns = Boolean(body.includeRuns);
    const sort = body.sort;
    const pageSize =
      typeof body.pageSize === "number" && body.pageSize > 0
        ? Math.min(body.pageSize, 100)
        : 25;
    const requestedPage =
      typeof body.page === "number" && body.page > 0 ? Math.floor(body.page) : 1;

    const documentIds = await getFilteredDocumentIds(params.projectId, filters);
    const totalCount = documentIds.length;

    if (!totalCount) {
      return NextResponse.json({
        documents: [],
        totalCount: 0,
        totalPages: 1,
        currentPage: 1,
      });
    }

    const orderBy: Prisma.DocumentOrderByWithRelationInput[] = [];

    if (sort) {
      if (sort.type === "base") {
        if (sort.key === "created") {
          orderBy.push({ createdAt: sort.direction });
        }
        if (sort.key === "title") {
          orderBy.push({ title: sort.direction });
        }
        if (sort.key === "source") {
          orderBy.push(
            { sourceType: sort.direction },
            { sourceUrl: sort.direction },
          );
        }
        if (sort.key === "uploader") {
          orderBy.push(
            { uploadedBy: { name: sort.direction } },
            { uploadedBy: { email: sort.direction } },
          );
        }
      }

      if (sort.type === "column") {
        orderBy.push({
          values: {
            path: [sort.key],
            sort: sort.direction,
          } as any,
        });
      }
    }

    if (!orderBy.length) {
      orderBy.push({ createdAt: "desc" });
    } else if (!orderBy.some((item) => "createdAt" in item)) {
      orderBy.push({ createdAt: "desc" });
    }

    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const currentPage = Math.min(requestedPage, totalPages);
    const skip = (currentPage - 1) * pageSize;

    const documents = await prisma.document.findMany({
      where: {
        projectId: params.projectId,
        id: { in: documentIds },
      },
      orderBy,
      take: pageSize,
      skip,
      include: includeRuns
        ? {
            uploadedBy: {
              select: { name: true, email: true },
            },
          }
        : undefined,
    });

    if (!includeRuns) {
      return NextResponse.json({
        documents,
        totalCount,
        totalPages,
        currentPage,
      });
    }

    const pagedDocumentIds = documents.map((doc) => doc.id);

    if (!pagedDocumentIds.length) {
      return NextResponse.json({
        documents: [],
        totalCount,
        totalPages,
        currentPage,
      });
    }

    const documentIdList = Prisma.join(
      pagedDocumentIds.map((id) => Prisma.sql`${id}::uuid`),
    );

    const latestRuns = await prisma.$queryRaw<
      Array<{
        documentId: string;
        columnKey: string;
        status: string;
        error: string | null;
      }>
    >`
      SELECT DISTINCT ON (r.document_id, c.key)
        r.document_id as "documentId",
        c.key as "columnKey",
        r.status::text as status,
        r.error
      FROM runs r
      JOIN columns c ON c.id = r.column_id
      WHERE r.project_id = ${params.projectId}::uuid
        AND r.type = 'processor'
        AND r.document_id IN (${documentIdList})
      ORDER BY r.document_id, c.key, r.created_at DESC
    `;

    const documentsWithRuns = documents.map((doc) => ({
      ...doc,
      latestRuns: latestRuns
        .filter((r) => r.documentId === doc.id)
        .reduce(
          (acc, r) => ({
            ...acc,
            [r.columnKey]: { status: r.status, error: r.error },
          }),
          {} as Record<string, { status: string; error: string | null }>,
        ),
    }));

    return NextResponse.json({
      documents: documentsWithRuns,
      totalCount,
      totalPages,
      currentPage,
    });
  } catch (error) {
    console.error("Document search error:", error);
    return NextResponse.json(
      { error: "Failed to load documents" },
      { status: 500 },
    );
  }
}
