import { Download, X } from "lucide-react";
import type { LightboxImage } from "../types";

type LightboxProps = {
  image: LightboxImage | null;
  onClose: () => void;
};

export function Lightbox({ image, onClose }: LightboxProps) {
  if (!image) return null;

  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={image.name} onClick={onClose}>
      <div className="lightbox-panel" onClick={(event) => event.stopPropagation()}>
        <div className="lightbox-toolbar">
          <div>
            <strong>{image.name}</strong>
            <span>{image.mimeType}</span>
          </div>
          <div className="lightbox-actions">
            <a className="icon-button" href={image.src} download={image.name} title="下载图片">
              <Download size={18} />
            </a>
            <button className="icon-button" type="button" title="关闭预览" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>
        <img src={image.src} alt={image.name} />
      </div>
    </div>
  );
}
