import { ImagePlus, Send, Sparkles, Wand2 } from "lucide-react";
import { KeyboardEvent, useRef, useState } from "react";
import { createId, fileToDataUrl } from "../lib/images";
import type { LightboxImage, UploadedImage } from "../types";

const quickActions = [
  {
    label: "清晰重绘",
    prompt: "请根据我上传的图片生成一张更清晰、更专业的版本。"
  },
  {
    label: "继续修改",
    prompt: "请在保留主体结构的基础上，按我的要求继续修改这张图。"
  },
  {
    label: "风格转换",
    prompt: "请把这张图转换成干净的产品级视觉风格，画面简洁、细节清楚。"
  },
  {
    label: "分析图片",
    prompt: "请分析这张图的内容，并给出可以优化的生成提示词。"
  }
];

type ComposerProps = {
  busy: boolean;
  prompt: string;
  attachments: UploadedImage[];
  onPromptChange: (value: string) => void;
  onAttachmentsChange: (images: UploadedImage[]) => void;
  onSend: (directImage: boolean) => void;
  onOpenImage: (image: LightboxImage) => void;
};

export function Composer({
  busy,
  prompt,
  attachments,
  onPromptChange,
  onAttachmentsChange,
  onSend,
  onOpenImage
}: ComposerProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);

  async function addFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList).filter((file) => file.type.startsWith("image/"));
    const nextImages: UploadedImage[] = [];

    for (const file of files) {
      nextImages.push({
        id: createId("upload"),
        name: file.name,
        type: file.type,
        dataUrl: await fileToDataUrl(file)
      });
    }

    onAttachmentsChange([...attachments, ...nextImages]);
  }

  function removeAttachment(id: string) {
    onAttachmentsChange(attachments.filter((image) => image.id !== id));
  }

  function handlePromptKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || busy || event.nativeEvent.isComposing) return;
    event.preventDefault();
    onSend(false);
  }

  return (
    <form
      className="composer"
      onSubmit={(event) => {
        event.preventDefault();
        onSend(false);
      }}
    >
      <div className="quick-actions" aria-label="快捷提示">
        {quickActions.map((action) => (
          <button key={action.label} type="button" onClick={() => onPromptChange(action.prompt)}>
            <Wand2 size={15} />
            {action.label}
          </button>
        ))}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        onChange={async (event) => {
          if (event.target.files) await addFiles(event.target.files);
          event.target.value = "";
        }}
      />

      <div
        className={`composer-box${dragging ? " dragging" : ""}`}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setDragging(false);
        }}
        onDrop={async (event) => {
          event.preventDefault();
          setDragging(false);
          await addFiles(event.dataTransfer.files);
        }}
      >
        {attachments.length ? (
          <div className="attachment-preview">
            {attachments.map((image) => (
              <div key={image.id} className="attachment-item" title={image.name}>
                <button
                  className="attachment-preview-button"
                  type="button"
                  onClick={() => onOpenImage({ src: image.dataUrl, name: image.name, mimeType: image.type })}
                >
                  <img src={image.dataUrl} alt={image.name} />
                  <span>{image.name}</span>
                </button>
                <button className="remove-image" type="button" title="移除图片" onClick={() => removeAttachment(image.id)}>
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <textarea
          rows={3}
          placeholder="输入你的需求，也可以先上传一张或多张图片再提出修改要求。"
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          onKeyDown={handlePromptKeyDown}
        />

        <div className="composer-tools">
          <div className="composer-action-buttons">
            <button
              className="icon-button attach-button"
              type="button"
              title="上传图片"
              onClick={() => inputRef.current?.click()}
            >
              <ImagePlus size={20} />
            </button>
            <button className="inline-image-button" type="button" disabled={busy} onClick={() => onSend(true)}>
              <Sparkles size={16} />
              单次 Image2
            </button>
            <button className="inline-send-button" type="submit" disabled={busy}>
              <Send size={17} />
              {busy ? "生成中" : "发送"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
