import type { GeneratedImage, LightboxImage, UploadedImage } from "../types";

export function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function imageToSrc(image: GeneratedImage) {
  return `data:${image.mimeType || "image/png"};base64,${image.b64_json}`;
}

export function imageExtension(mimeType: string) {
  return mimeType.includes("jpeg") || mimeType.includes("jpg") ? "jpg" : "png";
}

export function generatedImageName(image: GeneratedImage, index: number) {
  return image.name || `image2-${index + 1}.${imageExtension(image.mimeType || "image/png")}`;
}

export function attachmentToLightbox(image: UploadedImage): LightboxImage {
  return {
    src: image.dataUrl,
    name: image.name,
    mimeType: image.type
  };
}

export function generatedToLightbox(image: GeneratedImage, index: number): LightboxImage {
  return {
    src: imageToSrc(image),
    name: generatedImageName(image, index),
    mimeType: image.mimeType
  };
}

export function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
