import { AiProviderError } from "./text.provider";
import type { ImageProvider, ImageRequest, ImageResult } from "./image.provider";

const SIZES: Record<ImageRequest["aspect"], string> = {
  square: "1024x1024",
  portrait: "1024x1536",
  landscape: "1536x1024",
};

/** Adapter for an OpenAI-compatible `/images/generations` endpoint. */
class GatewayImageProvider implements ImageProvider {
  readonly name = "ai-gateway";
  readonly isMock = false;

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
    private readonly model: string,
  ) {}

  async generate(request: ImageRequest): Promise<ImageResult> {
    const res = await fetch(`${this.baseUrl}/images/generations`, {
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
    if (first?.b64_json) {
      return {
        base64: first.b64_json,
        contentType: "image/png",
        provider: this.name,
        model: this.model,
        isMock: false,
      };
    }
    if (first?.url) {
      const bytes = new Uint8Array(await (await fetch(first.url)).arrayBuffer());
      return {
        base64: toBase64(bytes),
        contentType: "image/png",
        provider: this.name,
        model: this.model,
        isMock: false,
      };
    }
    throw new AiProviderError("The image service returned no image.", 502);
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

  async generate(request: ImageRequest): Promise<ImageResult> {
    const [w, h] = SIZES[request.aspect].split("x").map(Number);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#16161d"/><text x="50%" y="48%" fill="#8b8b9a" font-family="sans-serif" font-size="34" text-anchor="middle">MOCK — no image provider</text><text x="50%" y="55%" fill="#5c5c6b" font-family="sans-serif" font-size="22" text-anchor="middle">${escapeXml(request.prompt.slice(0, 48))}</text></svg>`;
    return {
      base64: toBase64(new TextEncoder().encode(svg)),
      contentType: "image/svg+xml",
      provider: this.name,
      model: "mock",
      isMock: true,
    };
  }
}

function escapeXml(value: string): string {
  return value.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c] ?? c);
}

export function resolveImageProvider(): ImageProvider {
  const apiKey = process.env['LOVABLE_API_KEY'] ?? process.env['AI_GATEWAY_API_KEY'];
  const baseUrl = process.env['AI_GATEWAY_URL'] ?? "https://ai.gateway.lovable.dev/v1";
  const model = process.env['AI_IMAGE_MODEL'] ?? "google/gemini-3.1-flash-image";
  if (!apiKey) return new MockImageProvider();
  return new GatewayImageProvider(apiKey, baseUrl, model);
}
