import { expect, test } from "vitest";
import { prioritizeTasks } from "../src/task-order";
test("attention and active tasks precede history without changing server data", () => {
  const rows = ["completed", "running", "failed", "queued", "timed_out", "paused"].map((status, id) => ({ id, status }));
  expect(prioritizeTasks(rows).map(x => x.status)).toEqual(["failed", "timed_out", "running", "queued", "paused", "completed"]);
  expect(rows[0].status).toBe("completed");
  expect(prioritizeTasks([{ id: 1 }, { id: 2 }]).map(x => x.id)).toEqual([1, 2]);
});
