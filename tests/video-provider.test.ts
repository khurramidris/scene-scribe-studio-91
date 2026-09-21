import { describe, expect, it } from "vitest";

import {
  assertSupported,
  VideoProviderError,
  type VideoCapabilities,
  type VideoSubmitRequest,
} from "@/services/video/video.provider";

const capabilities: VideoCapabilities = {
  modes: ["image_to_video"],
  aspects: ["9:16"],
  resolutions: ["720p"],
  minDurationSeconds: 3,
  maxDurationSeconds: 8,
  supportsNegativePrompt: false,
  supportsSeed: false,
  supportsReferenceImages: false,
  supportsCancel: false,
  isMock: false,
};

const base: VideoSubmitRequest = {
  mode: "image_to_video",
  prompt: "A lantern swings in the wind.",
  aspect: "9:16",
  resolution: "720p",
  durationSeconds: 5,
  images: [],
};

describe("video provider capability contract", () => {
  it("accepts a request the provider supports", () => {
    expect(() => assertSupported(capabilities, base)).not.toThrow();
  });

  it("rejects an unsupported generation mode", () => {
    expect(() => assertSupported(capabilities, { ...base, mode: "text_to_video" })).toThrow(
      VideoProviderError,
    );
  });

  it("rejects an unsupported aspect ratio", () => {
    expect(() => assertSupported(capabilities, { ...base, aspect: "16:9" })).toThrow();
  });

  it("rejects an unsupported resolution", () => {
    expect(() => assertSupported(capabilities, { ...base, resolution: "4k" })).toThrow();
  });

  it("rejects a clip longer than the provider renders", () => {
    expect(() => assertSupported(capabilities, { ...base, durationSeconds: 30 })).toThrow();
  });

  it("rejects options the provider does not implement", () => {
    expect(() => assertSupported(capabilities, { ...base, negativePrompt: "blurry" })).toThrow();
    expect(() => assertSupported(capabilities, { ...base, seed: 42 })).toThrow();
    expect(() =>
      assertSupported(capabilities, {
        ...base,
        images: [{ base64: "", mimeType: "image/png", role: "reference" }],
      }),
    ).toThrow();
  });
});
