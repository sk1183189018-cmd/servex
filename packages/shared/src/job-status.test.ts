import { describe, expect, it } from "vitest";
import {
  DEFAULT_JOB_STATUSES,
  JOB_STATUS_LABELS,
  JOB_STATUS_TRANSITIONS,
  canTransition,
  isTerminalStatus,
} from "./job-status.js";

describe("job status model", () => {
  it("has a label for every status", () => {
    for (const status of DEFAULT_JOB_STATUSES) {
      expect(JOB_STATUS_LABELS[status], status).toBeTruthy();
    }
  });

  it("only transitions to known statuses", () => {
    for (const status of DEFAULT_JOB_STATUSES) {
      for (const next of JOB_STATUS_TRANSITIONS[status]) {
        expect(DEFAULT_JOB_STATUSES, `${status} -> ${next}`).toContain(next);
      }
    }
  });

  it("allows the normal path from new to completed", () => {
    const path = [
      "new",
      "confirmed",
      "assigned",
      "accepted",
      "en_route",
      "arrived",
      "in_progress",
      "completed",
    ] as const;
    for (let i = 0; i < path.length - 1; i++) {
      const from = path[i]!;
      const to = path[i + 1]!;
      expect(canTransition(from, to), `${from} -> ${to}`).toBe(true);
    }
  });

  it("does not allow skipping straight to completed", () => {
    expect(canTransition("new", "completed")).toBe(false);
    expect(canTransition("assigned", "completed")).toBe(false);
  });

  it("lets a declined assignment go back to confirmed", () => {
    expect(canTransition("assigned", "confirmed")).toBe(true);
  });

  it("treats completed, cancelled and rejected as terminal", () => {
    const terminal = DEFAULT_JOB_STATUSES.filter((status) => isTerminalStatus(status));
    expect(terminal).toEqual(["completed", "cancelled", "rejected"]);
    expect(canTransition("completed", "in_progress")).toBe(false);
  });

  it("never moves back to new", () => {
    for (const status of DEFAULT_JOB_STATUSES) {
      expect(canTransition(status, "new"), status).toBe(false);
    }
  });
});
