import {
  assertSupported,
  VideoProviderError,
  type VideoCapabilities,
  type VideoJobHandle,
  type VideoJobStatus,
  type VideoProvider,
  type VideoResult,
  type VideoSubmitRequest,
} from "./video.provider";

/* ------------------------------------------------------------------ */
/* Managed gateway adapter (real renders)                              */
/* ------------------------------------------------------------------ */

/**
 * Adapter for the managed AI gateway's async video API:
 * POST /videos -> job, GET /videos/{id} -> status, GET /videos/{id}/content -> MP4.
 */
class GatewayVideoProvider implements VideoProvider {
  readonly name = "ai-gateway";

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
    readonly model: string,
  ) {}

  readonly capabilities: VideoCapabilities = {
    modes: ["text_to_video", "image_to_video", "first_last_frame"],
    aspects: ["9:16", "16:9"],
    resolutions: ["360p", "720p", "1080p"],
    minDurationSeconds: 3,
    maxDurationSeconds: 10,
    supportsNegativePrompt: false,
    supportsSeed: false,
    supportsReferenceImages: true,
    supportsCancel: false,
    isMock: false,
  };

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  async submit(request: VideoSubmitRequest): Promise<VideoJobHandle> {
    assertSupported(this.capabilities, request);

    // Image roles are bound explicitly. The model reads the ordered media parts
    // through the role tags declared in the prompt, so a first/last frame pair
    // is never two unlabelled pictures.
    const ordered = [
      ...request.images.filter((i) => i.role === "first_frame"),
      ...request.images.filter((i) => i.role === "last_frame"),
      ...request.images.filter((i) => i.role === "reference"),
    ];
    const first = ordered.find((i) => i.role === "first_frame");
    const last = ordered.find((i) => i.role === "last_frame");

    const roleLines: string[] = [];
    if (first && last) {
      roleLines.push(
        "[# Sources <FIRST_FRAME>@Image1, <LAST_FRAME>@Image2]",
        "Begin the video exactly on <FIRST_FRAME> and end it exactly on <LAST_FRAME>, interpolating a single continuous shot between them.",
      );
    } else if (first) {
      roleLines.push(
        "[# Sources <FIRST_FRAME>@Image1]",
        "Begin the video exactly on <FIRST_FRAME> and animate forward from it.",
      );
    }
    const references = ordered.filter((i) => i.role === "reference");
    references.forEach((_, index) => {
      roleLines.push(`[# References <IMAGE_REF_${index}>] Use it as a likeness reference only.`);
    });
    if (request.negativePrompt) roleLines.push(`Avoid: ${request.negativePrompt}.`);

    const parts: unknown[] = [
      { type: "text", text: [...roleLines, request.prompt].filter(Boolean).join(" ") },
    ];
    for (const image of ordered) {
      parts.push({ type: "image", data: image.base64, mime_type: image.mimeType });
    }

    const task = ordered.length ? "image_to_video" : "text_to_video";
    const body: Record<string, unknown> = {
      model: this.model,
      input: parts,
      response_format: {
        type: "video",
        resolution: request.resolution,
        duration: `${Math.round(request.durationSeconds)}s`,
        aspect_ratio: request.aspect,
      },
      generation_config: { video_config: { task } },
    };

    const res = await fetch(`${this.baseUrl}/videos`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw await toError(res);
    const job = (await res.json()) as { id?: string };
    if (!job.id) throw new VideoProviderError("The video service returned no job id.", 502);
    return { providerJobId: job.id, provider: this.name, model: this.model };
  }

  async status(handle: VideoJobHandle): Promise<VideoJobStatus> {
    const res = await fetch(`${this.baseUrl}/videos/${handle.providerJobId}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) throw await toError(res);
    const job = (await res.json()) as {
      status?: string;
      progress?: number;
      error?: { code?: string; message?: string };
    };
    if (job.status === "completed") return { state: "completed", progress: 100 };
    if (job.status === "failed") {
      return {
        state: "failed",
        error: {
          code: job.error?.code ?? "provider_error",
          message: job.error?.message ?? "The video service could not render this shot.",
        },
      };
    }
    return { state: "processing", progress: job.progress ?? undefined };
  }

  async fetchResult(handle: VideoJobHandle): Promise<VideoResult> {
    const res = await fetch(`${this.baseUrl}/videos/${handle.providerJobId}/content`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) throw await toError(res);
    return {
      bytes: new Uint8Array(await res.arrayBuffer()),
      mimeType: "video/mp4",
    };
  }
}

/* ------------------------------------------------------------------ */
/* External / self-hosted REST adapter                                 */
/* ------------------------------------------------------------------ */

/**
 * Generic adapter for any REST renderer that implements the documented
 * contract in `docs/VIDEO_PROVIDER_CONTRACT.md`:
 *
 *   POST   {base}/jobs            -> 200 { id }
 *   GET    {base}/jobs/{id}       -> 200 { state, progress?, error?, usage? }
 *   GET    {base}/jobs/{id}/result-> 200 video bytes
 *   POST   {base}/jobs/{id}/cancel-> 200
 *
 * Used both for commercial APIs behind a thin proxy and for our future
 * self-hosted GPU worker. No GPU model ever runs inside this application.
 */
class RestVideoProvider implements VideoProvider {
  constructor(
    readonly name: string,
    private readonly baseUrl: string,
    private readonly token: string,
    readonly model: string,
    readonly capabilities: VideoCapabilities,
  ) {}

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.token}`,
    };
  }

  async submit(request: VideoSubmitRequest): Promise<VideoJobHandle> {
    assertSupported(this.capabilities, request);
    const res = await fetch(`${this.baseUrl}/jobs`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ model: this.model, ...request }),
    });
    if (!res.ok) throw await toError(res);
    const job = (await res.json()) as { id?: string };
    if (!job.id) throw new VideoProviderError("The renderer returned no job id.", 502);
    return { providerJobId: job.id, provider: this.name, model: this.model };
  }

  async status(handle: VideoJobHandle): Promise<VideoJobStatus> {
    const res = await fetch(`${this.baseUrl}/jobs/${handle.providerJobId}`, {
      headers: this.headers(),
    });
    if (!res.ok) throw await toError(res);
    const job = (await res.json()) as VideoJobStatus;
    return job;
  }

  async fetchResult(handle: VideoJobHandle): Promise<VideoResult> {
    const res = await fetch(`${this.baseUrl}/jobs/${handle.providerJobId}/result`, {
      headers: this.headers(),
    });
    if (!res.ok) throw await toError(res);
    return {
      bytes: new Uint8Array(await res.arrayBuffer()),
      mimeType: res.headers.get("content-type") ?? "video/mp4",
    };
  }

  async cancel(handle: VideoJobHandle): Promise<void> {
    if (!this.capabilities.supportsCancel) {
      throw new VideoProviderError("This renderer does not support cancellation.", 400);
    }
    const res = await fetch(`${this.baseUrl}/jobs/${handle.providerJobId}/cancel`, {
      method: "POST",
      headers: this.headers(),
    });
    if (!res.ok) throw await toError(res);
  }
}

/* ------------------------------------------------------------------ */
/* Mock adapter — explicitly labelled, never a real render              */
/* ------------------------------------------------------------------ */

class MockVideoProvider implements VideoProvider {
  readonly name = "mock";
  readonly model = "mock";

  readonly capabilities: VideoCapabilities = {
    modes: ["text_to_video", "image_to_video", "first_last_frame"],
    aspects: ["9:16", "16:9"],
    resolutions: ["360p", "720p"],
    minDurationSeconds: 1,
    maxDurationSeconds: 20,
    supportsNegativePrompt: true,
    supportsSeed: true,
    supportsReferenceImages: false,
    supportsCancel: true,
    isMock: true,
  };

  async submit(request: VideoSubmitRequest): Promise<VideoJobHandle> {
    assertSupported(this.capabilities, request);
    return {
      providerJobId: `mock-${crypto.randomUUID()}`,
      provider: this.name,
      model: this.model,
      meta: { submittedAt: Date.now() },
    };
  }

  async status(): Promise<VideoJobStatus> {
    return { state: "completed", progress: 100 };
  }

  async fetchResult(): Promise<VideoResult> {
    // A tiny, obviously-synthetic placeholder. Flagged `is_mock` everywhere
    // it is stored and badged "Mock" in the interface.
    return {
      bytes: new TextEncoder().encode("MOCK — no video provider configured"),
      mimeType: "text/plain",
      durationSeconds: 0,
    };
  }

  async cancel(): Promise<void> {}
}

async function toError(res: Response): Promise<VideoProviderError> {
  const detail = await res.text().catch(() => "");
  let message = detail.slice(0, 300);
  try {
    const parsed = JSON.parse(detail) as { message?: string; error?: { message?: string } };
    message = parsed.message ?? parsed.error?.message ?? message;
  } catch {
    /* plain-text body */
  }
  if (res.status === 402) {
    return new VideoProviderError(
      message || "AI credits are exhausted. Add credits to render video.",
      402,
    );
  }
  if (res.status === 429 || res.status >= 500) {
    return new VideoProviderError(
      message || "The video service is busy. The job will be retried.",
      res.status,
      true,
    );
  }
  return new VideoProviderError(
    message || `The video service rejected the request (${res.status}).`,
    res.status,
  );
}

export type VideoProviderId = "gateway" | "external" | "selfhosted" | "mock";

function restCapabilities(prefix: string, supportsCancel: boolean): VideoCapabilities {
  const read = (key: string, fallback: string) => process.env[`${prefix}_${key}`] ?? fallback;
  return {
    modes: read("MODES", "text_to_video,image_to_video").split(",") as VideoCapabilities["modes"],
    aspects: read("ASPECTS", "9:16,16:9").split(",") as VideoCapabilities["aspects"],
    resolutions: read("RESOLUTIONS", "720p").split(","),
    minDurationSeconds: Number(read("MIN_SECONDS", "1")),
    maxDurationSeconds: Number(read("MAX_SECONDS", "10")),
    supportsNegativePrompt: read("NEGATIVE_PROMPT", "true") === "true",
    supportsSeed: read("SEED", "true") === "true",
    supportsReferenceImages: read("REFERENCE_IMAGES", "false") === "true",
    supportsCancel,
    isMock: false,
  };
}

/**
 * Resolves the configured renderer. `VIDEO_PROVIDER` selects the adapter;
 * when the selected adapter is not configured we fall back to the explicit
 * mock rather than pretending a render happened.
 */
export function resolveVideoProvider(preferred?: string): VideoProvider {
  const choice = (preferred ?? process.env["VIDEO_PROVIDER"] ?? "gateway") as VideoProviderId;

  if (choice === "external") {
    const url = process.env["EXTERNAL_VIDEO_API_URL"];
    const key = process.env["EXTERNAL_VIDEO_API_KEY"];
    if (url && key) {
      return new RestVideoProvider(
        "external",
        url.replace(/\/$/, ""),
        key,
        process.env["EXTERNAL_VIDEO_MODEL"] ?? "default",
        restCapabilities("EXTERNAL_VIDEO", process.env["EXTERNAL_VIDEO_CANCEL"] === "true"),
      );
    }
    return new MockVideoProvider();
  }

  if (choice === "selfhosted") {
    const url = process.env["SELF_HOSTED_RENDER_URL"];
    const token = process.env["SELF_HOSTED_RENDER_TOKEN"];
    if (url && token) {
      return new RestVideoProvider(
        "selfhosted",
        url.replace(/\/$/, ""),
        token,
        process.env["SELF_HOSTED_RENDER_MODEL"] ?? "fasth3",
        restCapabilities("SELF_HOSTED_RENDER", true),
      );
    }
    return new MockVideoProvider();
  }

  if (choice === "gateway") {
    const apiKey = process.env["LOVABLE_API_KEY"] ?? process.env["AI_GATEWAY_API_KEY"];
    const baseUrl = process.env["AI_GATEWAY_URL"] ?? "https://ai.gateway.lovable.dev/v1";
    const model = process.env["AI_VIDEO_MODEL"] ?? "google/gemini-omni-1.1-flash";
    if (apiKey) return new GatewayVideoProvider(apiKey, baseUrl, model);
  }

  return new MockVideoProvider();
}

/** Capability descriptor for the browser — never includes credentials. */
export function describeVideoProvider(preferred?: string) {
  const provider = resolveVideoProvider(preferred);
  return {
    provider: provider.name,
    model: provider.model,
    capabilities: provider.capabilities,
  };
}
