import { describe, expect, it, beforeEach, afterEach } from "vitest";

import { resolveTextProvider } from "../src/services/ai/text.registry.server";
import { resolveImageProvider } from "../src/services/ai/image.registry.server";

const KEYS = ["LOVABLE_API_KEY", "AI_GATEWAY_API_KEY"] as const;
const saved: Record<string, string | undefined> = {};

describe("AI provider registries", () => {
  beforeEach(() => {
    for (const key of KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });
  afterEach(() => {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it("falls back to an explicitly flagged mock when no provider is configured", async () => {
    const text = resolveTextProvider();
    expect(text.isMock).toBe(true);
    const image = resolveImageProvider();
    expect(image.isMock).toBe(true);
  });

  it("marks mock text output so the UI can never present it as real", async () => {
    const provider = resolveTextProvider();
    const result = await provider.generateStructured({
      schemaName: "concepts",
      schema: { type: "object", properties: { synopsis: { type: "string" } } },
      system: "test",
      prompt: "test",
      language: "en",
    });
    expect(result.isMock).toBe(true);
    expect(JSON.stringify(result.data)).toBeTruthy();
  });

  it("returns a flagged placeholder image when no image provider is configured", async () => {
    const provider = resolveImageProvider();
    const image = await provider.generate({ prompt: "test", aspect: "portrait" });
    expect(image.isMock).toBe(true);
    expect(image.base64.length).toBeGreaterThan(0);
  });
});
