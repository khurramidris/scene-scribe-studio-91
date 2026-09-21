import { AiProviderError, type StructuredRequest, type StructuredResult, type TextProvider } from "./text.provider";

/**
 * Adapter for an OpenAI-compatible Responses API endpoint (the managed Lovable
 * AI Gateway by default, any compatible endpoint via AI_GATEWAY_URL).
 */
class ResponsesApiTextProvider implements TextProvider {
  readonly name = "ai-gateway";
  readonly isMock = false;

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
    private readonly model: string,
  ) {}

  async generateStructured(request: StructuredRequest): Promise<StructuredResult> {
    const res = await fetch(`${this.baseUrl}/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": this.apiKey,
        Authorization: `Bearer ${this.apiKey}`,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: this.model,
        stream: true,
        store: false,
        reasoning: { effort: "low", summary: "auto" },
        input: [
          { role: "system", content: [{ type: "input_text", text: request.system }] },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `${request.prompt}\n\nWrite every human-readable value in this language: ${request.language}.`,
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: request.schemaName,
            strict: true,
            schema: request.schema,
          },
        },
      }),
    });

    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => "");
      throw new AiProviderError(mapGatewayError(res.status, detail), res.status);
    }

    const text = await readOutputText(res.body);
    if (!text.trim()) {
      throw new AiProviderError("The AI returned an empty result. Try again.", 502);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new AiProviderError("The AI returned malformed data. Try again.", 502);
    }

    return { data: parsed, provider: this.name, model: this.model, isMock: false };
  }
}

function mapGatewayError(status: number, detail: string): string {
  if (status === 402) return "AI credits are exhausted. Add credits to continue generating.";
  if (status === 429) return "The AI service is rate limited right now. Try again in a moment.";
  if (status === 401) return "The AI service is not configured correctly (missing or invalid key).";
  if (status >= 500) return "The AI service is temporarily unavailable. Try again.";
  return `The AI service rejected the request (${status}). ${detail.slice(0, 200)}`;
}

/** Reads an SSE body and concatenates `response.output_text.delta` events. */
async function readOutputText(body: ReadableStream<Uint8Array>): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let out = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let index: number;
    while ((index = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const event = JSON.parse(payload) as {
          type?: string;
          delta?: string;
          response?: { output_text?: string };
        };
        if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
          out += event.delta;
        } else if (event.type === "response.completed" && !out && event.response?.output_text) {
          out = event.response.output_text;
        }
      } catch {
        // Ignore keep-alive or partial frames.
      }
    }
  }

  return out;
}

/**
 * Explicit development mock. Results are flagged `isMock` everywhere they are
 * stored and shown, and are never presented as a real generation.
 */
class MockTextProvider implements TextProvider {
  readonly name = "mock";
  readonly isMock = true;

  async generateStructured(request: StructuredRequest): Promise<StructuredResult> {
    const props = (request.schema['properties'] ?? {}) as Record<string, { type?: string }>;
    const data: Record<string, unknown> = {};
    for (const [key, def] of Object.entries(props)) {
      data[key] =
        def.type === "array"
          ? []
          : `[MOCK — no AI provider configured] ${key} for: ${request.prompt.slice(0, 80)}`;
    }
    return { data, provider: this.name, model: "mock", isMock: true };
  }
}

export function resolveTextProvider(): TextProvider {
  const apiKey = process.env['LOVABLE_API_KEY'] ?? process.env['AI_GATEWAY_API_KEY'];
  const baseUrl = process.env['AI_GATEWAY_URL'] ?? "https://ai.gateway.lovable.dev/v1";
  const model = process.env['AI_TEXT_MODEL'] ?? "openai/gpt-6-astra";
  if (!apiKey) return new MockTextProvider();
  return new ResponsesApiTextProvider(apiKey, baseUrl, model);
}
