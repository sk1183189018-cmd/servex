export type DeliveryStatus = "In progress" | "Planned";

export interface RoadmapEntry {
  readonly phase: string;
  readonly area: string;
  readonly status: DeliveryStatus;
}

/** Delivery status of each build phase. Keep in sync with docs/ROADMAP.md. */
export const ROADMAP: readonly RoadmapEntry[] = [
  { phase: "1", area: "Workspace, CI and shared domain package", status: "In progress" },
  { phase: "2", area: "Database, auth, tenants, roles and audit log", status: "Planned" },
  { phase: "3", area: "Web app: design system, CRM, bookings, work orders", status: "Planned" },
  { phase: "4", area: "Technicians, dispatch, inventory, billing, AMC", status: "Planned" },
  { phase: "5", area: "Customer portal, quotations and payments", status: "Planned" },
  { phase: "6", area: "Android app and cloud builds", status: "Planned" },
  { phase: "7", area: "SERVEX AI and analytics", status: "Planned" },
  { phase: "8", area: "Windows and macOS desktop apps", status: "Planned" },
  { phase: "9", area: "Security review, monitoring and release", status: "Planned" },
];
