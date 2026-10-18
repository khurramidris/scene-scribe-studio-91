export const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;
export const IMAGE_UPLOAD_ACCEPT = "image/png,image/jpeg,image/webp";
export const IMAGE_UPLOAD_HELP = "PNG, JPEG or WebP · up to 10 MB";

export function validateImageUpload(file: { size: number; type: string }): string {
  if (!Number.isSafeInteger(file.size) || file.size <= 0) {
    throw new Error("Choose an image that is not empty.");
  }
  if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
    throw new Error("Choose an image smaller than 10 MB.");
  }
  const extension = new Map([
    ["image/png", "png"],
    ["image/jpeg", "jpg"],
    ["image/webp", "webp"],
  ]).get(file.type);
  if (!extension) throw new Error("Upload a PNG, JPEG or WebP image.");
  return extension;
}

/** Check the bytes as well as the browser-supplied MIME type. */
export function inspectImageUpload(bytes: Uint8Array, mimeType: string): void {
  validateImageUpload({ size: bytes.byteLength, type: mimeType });
  const begins = (signature: number[]) => signature.every((value, i) => bytes[i] === value);
  const valid =
    (mimeType === "image/png" && bytes.length >= 24 && begins([137, 80, 78, 71, 13, 10, 26, 10])) ||
    (mimeType === "image/jpeg" && bytes.length >= 4 && begins([255, 216, 255])) ||
    (mimeType === "image/webp" &&
      bytes.length >= 16 &&
      begins([82, 73, 70, 70]) &&
      [87, 69, 66, 80].every((value, i) => bytes[i + 8] === value));
  if (!valid)
    throw new Error("The file contents do not match a supported image. Choose another image.");
}

export function assertImageUploadPath(path: string, prefix: string): void {
  const filename = path.startsWith(prefix) ? path.slice(prefix.length) : "";
  if (!/^[a-f0-9-]{36}\.(png|jpg|webp)$/.test(filename)) {
    throw new Error("That upload does not belong to this image slot.");
  }
}

export function imageBytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
}
