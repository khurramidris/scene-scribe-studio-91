/**
 * Provider-independent image generation interface used by the Character Studio
 * and the Storyboard Studio.
 * Swapping providers means adding an adapter and changing the registry only.
 */

export type ImageReferenceInput = {
  base64: string;
  mimeType: string;
  /** Human label used in prompts when the provider cannot accept the bytes. */
  label: string;
};

export type ImageRequest = {
  prompt: string;
  /** Aspect ratio hint; adapters map it to their own size parameters. */
  aspect: "square" | "portrait" | "landscape";
  /**
   * Approved character / location images to condition on. Adapters that do not
   * declare `supportsReferenceImages` ignore these — callers must then avoid
   * claiming guaranteed visual consistency.
   */
  references?: ImageReferenceInput[];
};

export type ImageResult = {
  /** Raw image bytes, base64 encoded (no data URL prefix). */
  base64: string;
  contentType: string;
  provider: string;
  model: string;
  /** True when the image is a development placeholder, not a real generation. */
  isMock: boolean;
  /** True when the reference images were actually sent to the model. */
  usedReferenceConditioning: boolean;
};

export interface ImageProvider {
  readonly name: string;
  readonly isMock: boolean;
  /** Whether reference images are passed as real image inputs. */
  readonly supportsReferenceImages: boolean;
  generate(request: ImageRequest): Promise<ImageResult>;
}
