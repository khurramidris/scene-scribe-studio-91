/**
 * Provider-independent video generation contract.
 *
 * Feature code depends on this file only. Adapters live in
 * `video.registry.server.ts` and are resolved per request, so a commercial API
 * today can be replaced by a self-hosted GPU renderer later without touching
 * any shot, storyboard or job code.
 *
 * Capabilities are explicit: the UI must only offer settings the currently
 * selected provider declares support for.
 */

export type VideoMode = "text_to_video" | "image_to_video" | "first_last_frame";

export type VideoAspect = "9:16" | "16:9";

export type VideoCapabilities = {
  modes: VideoMode[];
  aspects: VideoAspect[];
  resolutions: string[];
  /** Inclusive range of clip lengths the provider accepts, in seconds. */
  minDurationSeconds: number;
  maxDurationSeconds: number;
  supportsNegativePrompt: boolean;
  supportsSeed: boolean;
  supportsReferenceImages: boolean;
  supportsCancel: boolean;
  /** True when results are development placeholders, never real renders. */
  isMock: boolean;
};

export type VideoInputImage = {
  base64: string;
  mimeType: string;
  /** How the adapter should bind this image in the request. */
  role: "first_frame" | "last_frame" | "reference";
};

export type VideoSubmitRequest = {
  mode: VideoMode;
  prompt: string;
  negativePrompt?: string | undefined;
  aspect: VideoAspect;
  resolution: string;
  durationSeconds: number;
  seed?: number | undefined;
  images: VideoInputImage[];
};

export type VideoJobHandle = {
  providerJobId: string;
  provider: string;
  model: string;
  /** Anything the adapter needs to resume polling in a later request. */
  meta?: Record<string, unknown>;
};

export type VideoJobStatus = {
  state: "processing" | "completed" | "failed" | "cancelled";
  /** 0–100 when the provider reports it. */
  progress?: number | undefined;
  error?: { code: string; message: string } | undefined;
  usage?: Record<string, unknown> | undefined;
};

export type VideoResult = {
  bytes: Uint8Array;
  mimeType: string;
  durationSeconds?: number | undefined;
  width?: number | undefined;
  height?: number | undefined;
  usage?: Record<string, unknown> | undefined;
};

export interface VideoProvider {
  readonly name: string;
  readonly model: string;
  readonly capabilities: VideoCapabilities;
  submit(request: VideoSubmitRequest): Promise<VideoJobHandle>;
  status(handle: VideoJobHandle): Promise<VideoJobStatus>;
  fetchResult(handle: VideoJobHandle): Promise<VideoResult>;
  cancel?(handle: VideoJobHandle): Promise<void>;
}

export class VideoProviderError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = "VideoProviderError";
  }
}

/** Throws when a request asks for something the provider does not support. */
export function assertSupported(
  capabilities: VideoCapabilities,
  request: VideoSubmitRequest,
): void {
  if (!capabilities.modes.includes(request.mode)) {
    throw new VideoProviderError(
      `This provider does not support ${request.mode.replace(/_/g, " ")}.`,
      400,
    );
  }
  if (!capabilities.aspects.includes(request.aspect)) {
    throw new VideoProviderError(`This provider does not support ${request.aspect} video.`, 400);
  }
  if (!capabilities.resolutions.includes(request.resolution)) {
    throw new VideoProviderError(
      `This provider does not support ${request.resolution}. Supported: ${capabilities.resolutions.join(", ")}.`,
      400,
    );
  }
  if (
    request.durationSeconds < capabilities.minDurationSeconds ||
    request.durationSeconds > capabilities.maxDurationSeconds
  ) {
    throw new VideoProviderError(
      `This provider renders clips between ${capabilities.minDurationSeconds}s and ${capabilities.maxDurationSeconds}s.`,
      400,
    );
  }
  if (request.negativePrompt && !capabilities.supportsNegativePrompt) {
    throw new VideoProviderError("This provider does not support a negative prompt.", 400);
  }
  if (request.seed !== undefined && !capabilities.supportsSeed) {
    throw new VideoProviderError("This provider does not support a fixed seed.", 400);
  }
  if (request.images.some((i) => i.role === "reference") && !capabilities.supportsReferenceImages) {
    throw new VideoProviderError("This provider does not accept reference images.", 400);
  }
}
