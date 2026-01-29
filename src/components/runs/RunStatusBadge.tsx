import { RunStatus } from "@prisma/client";

type RunStatusValue = RunStatus | "running" | "pending" | null | undefined;

const getStatusClassName = (status: RunStatusValue) => {
  switch (status) {
    case "queued":
      return "table__cell__status-icon table__cell__status-icon--queued";
    case "running":
      return "table__cell__status-icon table__cell__status-icon--running";
    case "success":
      return "table__cell__status-icon table__cell__status-icon--success";
    case "error":
      return "table__cell__status-icon table__cell__status-icon--error";
    case "pending":
      return "table__cell__status-icon table__cell__status-icon--pending";
    default:
      return "table__cell__status-icon";
  }
};

const getStatusIcon = (status: RunStatusValue) => {
  switch (status) {
    case "pending":
      return (
        <svg viewBox="0 0 16 16" fill="none">
          <circle
            cx="8"
            cy="8"
            r="6"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray="4 2"
          />
        </svg>
      );
    case "queued":
      return (
        <svg viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" />
          <circle cx="8" cy="8" r="2" fill="currentColor" />
        </svg>
      );
    case "running":
      return (
        <svg viewBox="0 0 16 16" fill="none" className="spinning">
          <circle
            cx="8"
            cy="8"
            r="6"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray="24"
            strokeDashoffset="8"
          />
        </svg>
      );
    case "success":
      return (
        <svg viewBox="0 0 16 16" fill="none">
          <path
            d="M3 8l3 3 7-7"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "error":
      return (
        <svg viewBox="0 0 16 16" fill="none">
          <path
            d="M12 4L4 12M4 4l8 8"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      );
    default:
      return null;
  }
};

const getStatusLabel = (status: RunStatusValue) => {
  switch (status) {
    case "running":
      return "Processing";
    case "queued":
      return "Queued";
    case "success":
      return "Done";
    case "error":
      return "Error";
    case "pending":
    default:
      return "Not run";
  }
};

export function RunStatusBadge({
  status,
  labelPrefix = "Status:",
}: {
  status: RunStatusValue;
  labelPrefix?: string;
}) {
  const normalizedStatus = status ?? "pending";
  const label = getStatusLabel(normalizedStatus);

  return (
    <div className="table__cell__status">
      <div className={getStatusClassName(normalizedStatus)}>
        {getStatusIcon(normalizedStatus)}
      </div>
      <span className="table__cell__status-label">
        {labelPrefix} {label}
      </span>
    </div>
  );
}
