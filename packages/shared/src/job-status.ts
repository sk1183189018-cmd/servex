/**
 * Default work-order statuses. Companies will be able to configure their own status sets
 * later; stored history must always keep the key that was in effect at the time, so these
 * keys are stable identifiers and not display text.
 */
export const DEFAULT_JOB_STATUSES = [
  "new",
  "pending",
  "confirmed",
  "assigned",
  "accepted",
  "en_route",
  "arrived",
  "in_progress",
  "waiting_for_parts",
  "waiting_for_approval",
  "completed",
  "cancelled",
  "rejected",
] as const;

export type JobStatus = (typeof DEFAULT_JOB_STATUSES)[number];

export const JOB_STATUS_LABELS: Readonly<Record<JobStatus, string>> = {
  new: "New",
  pending: "Pending",
  confirmed: "Confirmed",
  assigned: "Assigned",
  accepted: "Accepted",
  en_route: "En Route",
  arrived: "Arrived",
  in_progress: "In Progress",
  waiting_for_parts: "Waiting for Parts",
  waiting_for_approval: "Waiting for Approval",
  completed: "Completed",
  cancelled: "Cancelled",
  rejected: "Rejected",
};

/**
 * Default allowed moves. "Rejected" means the company turned the request down. A technician
 * declining an assignment sends the job back to "confirmed" so it can be reassigned.
 */
export const JOB_STATUS_TRANSITIONS: Readonly<Record<JobStatus, readonly JobStatus[]>> = {
  new: ["pending", "confirmed", "cancelled", "rejected"],
  pending: ["confirmed", "assigned", "cancelled", "rejected"],
  confirmed: ["assigned", "cancelled"],
  assigned: ["accepted", "confirmed", "assigned", "cancelled"],
  accepted: ["en_route", "assigned", "cancelled"],
  en_route: ["arrived", "cancelled"],
  arrived: ["in_progress", "cancelled"],
  in_progress: ["waiting_for_parts", "waiting_for_approval", "completed", "cancelled"],
  waiting_for_parts: ["in_progress", "cancelled"],
  waiting_for_approval: ["in_progress", "cancelled"],
  completed: [],
  cancelled: [],
  rejected: [],
};

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return JOB_STATUS_TRANSITIONS[from].includes(to);
}

export function isTerminalStatus(status: JobStatus): boolean {
  return JOB_STATUS_TRANSITIONS[status].length === 0;
}
