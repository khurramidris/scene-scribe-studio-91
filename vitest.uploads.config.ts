import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** These tests use in-memory storage/database clients; no live services or credentials. */
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["tests/image-uploads.test.ts", "tests/storyboard-references.test.ts"],
    setupFiles: ["tests/helpers/offline.ts"],
  },
});
