import { Download } from "lucide-react";
import {
  attachmentToLightbox,
  generatedImageName,
  generatedToLightbox,
  imageToSrc
} from "../lib/images";
import type { GeneratedImage, LightboxImage, UploadedImage } from "../types";

type AttachmentTileProps = {
  image: UploadedImage;
  onOpen: (image: LightboxImage) => void;
};

type GeneratedTileProps = {
  image: GeneratedImage;
  index: number;
  onOpen: (image: LightboxImage) => void;
};

export function AttachmentTile({ image, onOpen }: AttachmentTileProps) {
  return (
    <button className="image-thumb" type="button" title={image.name} onClick={() => onOpen(attachmentToLightbox(image))}>
      <img src={image.dataUrl} alt={image.name} />
      <span>{image.name}</span>
    </button>
  );
}

export function GeneratedTile({ image, index, onOpen }: GeneratedTileProps) {
  const src = imageToSrc(image);
  const name = generatedImageName(image, index);

  return (
    <figure className={`result-image${image.preview ? " preview-result" : ""}`}>
      <button className="result-preview" type="button" title={name} onClick={() => onOpen(generatedToLightbox(image, index))}>
        <img src={src} alt={name} />
        <span>{image.preview ? `预览 · ${name}` : name}</span>
      </button>
      <a className="download-link" href={src} download={name}>
        <Download size={15} />
        下载图片
      </a>
    </figure>
  );
}
