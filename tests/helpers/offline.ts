import { vi } from "vitest";

// A test must explicitly provide a fake response; accidental network calls fail.
vi.stubGlobal(
  "fetch",
  vi.fn(() => Promise.reject(new Error("Network disabled in upload tests."))),
);
