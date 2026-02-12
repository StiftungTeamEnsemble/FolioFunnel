"use client";

import Link from "next/link";
import "@/styles/components/pagination.css";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange?: (page: number) => void;
  previousHref?: string;
  nextHref?: string;
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  previousHref,
  nextHref,
}: PaginationProps) {
  const canGoPrevious = currentPage > 1;
  const canGoNext = currentPage < totalPages;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "12px",
        flexWrap: "wrap",
      }}
    >
      <span className="tasks-pager__label">
        Page {currentPage} of {totalPages}
      </span>
      <div className="tasks-pager__controls">
        {canGoPrevious ? (
          onPageChange ? (
            <button
              type="button"
              className="tasks-pager__link"
              onClick={() => onPageChange(currentPage - 1)}
            >
              Previous
            </button>
          ) : (
            <Link href={previousHref ?? "#"} className="tasks-pager__link">
              Previous
            </Link>
          )
        ) : (
          <span className="tasks-pager__link tasks-pager__link--disabled">
            Previous
          </span>
        )}
        {canGoNext ? (
          onPageChange ? (
            <button
              type="button"
              className="tasks-pager__link"
              onClick={() => onPageChange(currentPage + 1)}
            >
              Next
            </button>
          ) : (
            <Link href={nextHref ?? "#"} className="tasks-pager__link">
              Next
            </Link>
          )
        ) : (
          <span className="tasks-pager__link tasks-pager__link--disabled">
            Next
          </span>
        )}
      </div>
    </div>
  );
}
