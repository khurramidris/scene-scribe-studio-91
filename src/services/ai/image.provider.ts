/**
 * Provider-independent image generation interface used by the Character Studio.
 * Swapping providers means adding an adapter and changing the registry only.
 */

export type ImageRequest = {
  prompt: string;
  /** Aspect ratio hint; adapters map it to their own size parameters. */
  aspect: "square" | "portrait" | "landscape";
};

export type ImageResult = {
  /** Raw image bytes, base64 encoded (no data URL prefix). */
  base64: string;
  contentType: string;
  provider: string;
  model: string;
  /** True when the image is a development placeholder, not a real generation. */
  isMock: boolean;
};

export interface ImageProvider {
  readonly name: string;
  readonly isMock: boolean;
  generate(request: ImageRequest): Promise<ImageResult>;
}
