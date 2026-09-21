/**
 * Provider-independent structured text generation interface.
 *
 * Feature code depends on this contract only. Adapters live in
 * `*.adapter.server.ts` files and are resolved by `resolveTextProvider()`
 * (see `text.registry.server.ts`), so the managed gateway can be swapped for
 * any other provider without touching the story or character modules.
 */

export type StructuredRequest = {
  /** Machine name of the schema, forwarded to providers that support it. */
  schemaName: string;
  /** JSON Schema (strict-compatible) describing the expected object. */
  schema: Record<string, unknown>;
  system: string;
  prompt: string;
  /** BCP-47-ish language code the output must be written in. */
  language: string;
};

export type StructuredResult = {
  data: unknown;
  provider: string;
  model: string;
  /** True when the result is development mock data, never a real generation. */
  isMock: boolean;
};

export interface TextProvider {
  readonly name: string;
  readonly isMock: boolean;
  generateStructured(request: StructuredRequest): Promise<StructuredResult>;
}

export class AiProviderError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}
