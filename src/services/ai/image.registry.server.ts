import { AiProviderError } from "./text.provider";
import type { ImageProvider, ImageRequest, ImageResult } from "./image.provider";

const SIZES: Record<ImageRequest["aspect"], string> = {
  square: "1024x1024",
  portrait: "1024x1536",
  landscape: "1536x1024",
};

/** Adapter for an OpenAI-compatible images endpoint (generations + edits). */
class GatewayImageProvider implements ImageProvider {
  readonly name = "ai-gateway";
  readonly isMock = false;
  readonly supportsReferenceImages = true;

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
    private readonly model: string,
  ) {}

  async generate(request: ImageRequest): Promise<ImageResult> {
    const references = request.references ?? [];
    const res = references.length
      ? await this.edit(request, references)
      : await this.create(request);

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      if (res.status === 402) {
        throw new AiProviderError("AI credits are exhausted. Add credits to generate images.", 402);
      }
      throw new AiProviderError(
        `The image service rejected the request (${res.status}). ${detail.slice(0, 200)}`,
        res.status,
      );
    }

    const json = (await res.json()) as { data?: Array<{ b64_json?: string; url?: string }> };
    const first = json.data?.[0];
    const base = {
      contentType: "image/png",
      provider: this.name,
      model: this.model,
      isMock: false,
      usedReferenceConditioning: references.length > 0,
    };
    if (first?.b64_json) return { base64: first.b64_json, ...base };
    if (first?.url) {
      const bytes = new Uint8Array(await (await fetch(first.url)).arrayBuffer());
      return { base64: toBase64(bytes), ...base };
    }
    throw new AiProviderError("The image service returned no image.", 502);
  }

  private create(request: ImageRequest): Promise<Response> {
    return fetch(`${this.baseUrl}/images/generations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": this.apiKey,
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        prompt: request.prompt,
        size: SIZES[request.aspect],
        n: 1,
      }),
    });
  }

  /** Reference conditioning: the approved images are sent as real inputs. */
  private edit(
    request: ImageRequest,
    references: NonNullable<ImageRequest["references"]>,
  ): Promise<Response> {
    const form = new FormData();
    form.append("model", this.model);
    form.append(
      "prompt",
      [
        request.prompt,
        "Reference images, in order:",
        ...references.map((reference, index) => `Image ${index + 1}: ${reference.label}`),
      ].join("\n"),
    );
    form.append("size", SIZES[request.aspect]);
    form.append("n", "1");
    references.forEach((reference, index) => {
      const bytes = Uint8Array.from(atob(reference.base64), (c) => c.charCodeAt(0));
      const ext =
        reference.mimeType === "image/jpeg"
          ? "jpg"
          : reference.mimeType === "image/webp"
            ? "webp"
            : "png";
      form.append(
        "image[]",
        new Blob([bytes as unknown as BlobPart], { type: reference.mimeType }),
        `reference-${index}.${ext}`,
      );
    });
    return fetch(`${this.baseUrl}/images/edits`, {
      method: "POST",
      headers: {
        "Lovable-API-Key": this.apiKey,
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: form,
    });
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Explicit development placeholder. Always flagged as mock in DB and UI. */
class MockImageProvider implements ImageProvider {
  readonly name = "mock";
  readonly isMock = true;
  readonly supportsReferenceImages = false;

  async generate(request: ImageRequest): Promise<ImageResult> {
    const [w, h] = SIZES[request.aspect].split("x").map(Number);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#16161d"/><text x="50%" y="48%" fill="#8b8b9a" font-family="sans-serif" font-size="34" text-anchor="middle">MOCK — no image provider</text><text x="50%" y="55%" fill="#5c5c6b" font-family="sans-serif" font-size="22" text-anchor="middle">${escapeXml(request.prompt.slice(0, 48))}</text></svg>`;
    return {
      base64: toBase64(new TextEncoder().encode(svg)),
      contentType: "image/svg+xml",
      provider: this.name,
      model: "mock",
      isMock: true,
      usedReferenceConditioning: false,
    };
  }
}

function escapeXml(value: string): string {
  return value.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c] ?? c);
}

export function resolveImageProvider(): ImageProvider {
  const apiKey = process.env["LOVABLE_API_KEY"] ?? process.env["AI_GATEWAY_API_KEY"];
  const baseUrl = process.env["AI_GATEWAY_URL"] ?? "https://ai.gateway.lovable.dev/v1";
  const model = process.env["AI_IMAGE_MODEL"] ?? "google/gemini-3.1-flash-image";
  if (!apiKey) return new MockImageProvider();
  return new GatewayImageProvider(apiKey, baseUrl, model);
}
