import { Check, Copy, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AttachmentTile, GeneratedTile } from "./ImageTile";
import { MarkdownMessage } from "./MarkdownMessage";
import type { ChatMessage, LightboxImage, RetryRequest } from "../types";

type ChatLogProps = {
  messages: ChatMessage[];
  onRetry: (request: RetryRequest) => void;
  onOpenImage: (image: LightboxImage) => void;
};

export function ChatLog({ messages, onRetry, onOpenImage }: ChatLogProps) {
  const logRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const [copiedMessageId, setCopiedMessageId] = useState("");

  useEffect(() => {
    const node = logRef.current;
    if (!node) return;
    if (!shouldAutoScrollRef.current) return;
    node.scrollTop = node.scrollHeight;
  }, [messages]);

  function handleScroll() {
    const node = logRef.current;
    if (!node) return;
    const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    shouldAutoScrollRef.current = distanceFromBottom < 80;
  }

  async function copyMessage(message: ChatMessage) {
    const imageNames = message.images?.map((image) => image.name).filter(Boolean).join("\n") || "";
    const text = [message.text, imageNames].filter(Boolean).join("\n\n");
    if (!text) return;

    await navigator.clipboard.writeText(text);
    setCopiedMessageId(message.id);
    window.setTimeout(() => setCopiedMessageId((id) => (id === message.id ? "" : id)), 1400);
  }

  return (
    <div ref={logRef} className="chat-log" onScroll={handleScroll}>
      {messages.map((message) => (
        <article key={message.id} className={`message ${message.role}`}>
          <div className="avatar">{message.role === "user" ? "我" : "AI"}</div>
          <div className="bubble">
            <div className="message-toolbar">
              {message.text || message.images?.length ? (
                <button className="copy-button" type="button" title="复制内容" onClick={() => void copyMessage(message)}>
                  {copiedMessageId === message.id ? <Check size={15} /> : <Copy size={15} />}
                  {copiedMessageId === message.id ? "已复制" : "复制"}
                </button>
              ) : null}
            </div>

            <MarkdownMessage text={message.text} error={message.error} />

            {message.status && !message.error ? (
              <p className="stream-status">
                {message.status}
                <span className="typing-dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
              </p>
            ) : null}

            {message.attachments?.length ? (
              <div className="message-attachments">
                {message.attachments.map((image) => (
                  <AttachmentTile key={image.id} image={image} onOpen={onOpenImage} />
                ))}
              </div>
            ) : null}

            {message.previewImage || message.isGeneratingImage ? (
              <div className="image-preview-stage">
                <div className="preview-caption">预览生成中</div>
                {message.previewImage ? (
                  <GeneratedTile image={message.previewImage} index={0} onOpen={onOpenImage} />
                ) : (
                  <div className="preview-skeleton" aria-label="图片预览生成中">
                    <div />
                    <span>等待 Image2 返回预览</span>
                  </div>
                )}
              </div>
            ) : null}

            {message.images?.length ? (
              <div className="message-images">
                {message.images.map((image, index) => (
                  <GeneratedTile
                    key={image.id || `${message.id}-${index}`}
                    image={image}
                    index={index}
                    onOpen={onOpenImage}
                  />
                ))}
              </div>
            ) : null}

            {message.durationMs ? (
              <div className="message-duration">耗时 {formatDuration(message.durationMs)}</div>
            ) : null}

            {message.retry ? (
              <button className="retry-button" type="button" onClick={() => onRetry(message.retry!)}>
                <RefreshCw size={15} />
                重新发送
              </button>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}

function formatDuration(durationMs: number) {
  if (durationMs < 1000) return `${durationMs} ms`;
  const seconds = durationMs / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds >= 10 ? 0 : 1)} 秒`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes} 分 ${rest} 秒`;
}
