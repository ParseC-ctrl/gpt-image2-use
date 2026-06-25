import { useEffect, useMemo, useRef, useState } from "react";
import { ChatLog } from "./components/ChatLog";
import { Composer } from "./components/Composer";
import { Lightbox } from "./components/Lightbox";
import { SettingsPanel } from "./components/SettingsPanel";
import { createId } from "./lib/images";
import { getStoredValue, removeStoredValue, setStoredValue } from "./lib/storage";
import type {
  ChatMessage,
  ChatPayload,
  GeneratedImage,
  LightboxImage,
  RetryRequest,
  ServerConversation,
  Settings,
  UploadedImage
} from "./types";

const defaultSettings: Settings = {
  apiKey: "",
  baseUrl: "https://api.openai.com/v1",
  reasoningModel: "gpt-5.5",
  imageModel: "gpt-image-2",
  size: "1024x1024",
  quality: "auto",
  outputFormat: "png"
};

const welcomeMessage: ChatMessage = {
  id: "welcome",
  role: "assistant",
  text: "上传图片或直接输入需求，我会根据多轮上下文生成、编辑或继续修改图片。"
};

export default function App() {
  const [settings, setSettings] = useState<Settings>(() => ({
    apiKey: getStoredValue("apiKey", defaultSettings.apiKey),
    baseUrl: getStoredValue("baseUrl", defaultSettings.baseUrl),
    reasoningModel: getStoredValue("reasoningModel", defaultSettings.reasoningModel),
    imageModel: getStoredValue("imageModel", defaultSettings.imageModel),
    size: getStoredValue("size", defaultSettings.size),
    quality: getStoredValue("quality", defaultSettings.quality),
    outputFormat: (getStoredValue("outputFormat", defaultSettings.outputFormat) as Settings["outputFormat"]) || "png"
  }));
  const [previousResponseId, setPreviousResponseId] = useState(() => getStoredValue("previousResponseId"));
  const [messages, setMessages] = useState<ChatMessage[]>([welcomeMessage]);
  const [prompt, setPrompt] = useState("");
  const [attachments, setAttachments] = useState<UploadedImage[]>([]);
  const [busy, setBusy] = useState(false);
  const [lightbox, setLightbox] = useState<LightboxImage | null>(null);
  const progressTimerRef = useRef<number | null>(null);
  const serverConversationReadyRef = useRef(false);

  const contextText = useMemo(
    () => (previousResponseId ? `上下文已连接：${previousResponseId}` : "尚未建立上下文"),
    [previousResponseId]
  );

  useEffect(() => {
    Object.entries(settings).forEach(([key, value]) => setStoredValue(key, String(value)));
  }, [settings]);

  useEffect(() => {
    let cancelled = false;

    async function loadServerConversation() {
      try {
        const response = await fetch("/api/conversation");
        if (!response.ok) throw new Error("读取服务器会话失败");
        const conversation = (await response.json()) as ServerConversation;
        if (cancelled) return;

        if (conversation.messages?.length) {
          setMessages(conversation.messages.map(restoreStoredMessage));
        }
        setPreviousResponseId(conversation.previousResponseId || "");
        if (conversation.previousResponseId) {
          setStoredValue("previousResponseId", conversation.previousResponseId);
        }
      } catch {
        // Local chat still works if server-side history cannot be restored.
      } finally {
        if (!cancelled) serverConversationReadyRef.current = true;
      }
    }

    void loadServerConversation();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!serverConversationReadyRef.current) return;

    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/conversation", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            messages: messages.map(sanitizeMessageForStorage),
            previousResponseId
          })
        });
        if (!response.ok) throw new Error("保存失败");
        await response.json();
      } catch {
        // Keep the interface quiet; the current session remains usable.
      }
    }, 650);

    return () => window.clearTimeout(timer);
  }, [messages, previousResponseId]);

  useEffect(() => {
    return () => stopProgressTimer();
  }, []);

  function updateMessage(id: string, patch: Partial<ChatMessage> | ((message: ChatMessage) => ChatMessage)) {
    setMessages((current) =>
      current.map((message) => {
        if (message.id !== id) return message;
        return typeof patch === "function" ? patch(message) : { ...message, ...patch };
      })
    );
  }

  function appendMessage(message: ChatMessage) {
    setMessages((current) => [...current, message]);
  }

  function clearContext() {
    setPreviousResponseId("");
    removeStoredValue("previousResponseId");
    void fetch("/api/conversation", { method: "DELETE" }).catch(() => undefined);
    setMessages([
      {
        id: createId("assistant"),
        role: "assistant",
        text: "上下文已清空。你可以上传图片或直接输入新的生成需求。"
      }
    ]);
  }

  function getPayload(): ChatPayload {
    return {
      ...settings,
      prompt: prompt.trim(),
      images: attachments.map((image) => ({ ...image })),
      previousResponseId
    };
  }

  function clonePayload(payload: ChatPayload): ChatPayload {
    return {
      ...payload,
      images: payload.images.map((image) => ({ ...image }))
    };
  }

  async function sendChat(directImage: boolean, retryPayload?: ChatPayload, options: { appendUser?: boolean } = {}) {
    if (busy) return;

    const payload = retryPayload ? clonePayload(retryPayload) : clonePayload(getPayload());
    payload.forceImage = directImage;
    if (!payload.apiKey.trim()) {
      appendMessage({
        id: createId("error"),
        role: "assistant",
        text: "请先填写 API Key 或访问令牌。",
        error: true
      });
      return;
    }

    if (!payload.prompt && !payload.images.length) {
      appendMessage({
        id: createId("error"),
        role: "assistant",
        text: "请输入需求，或先上传一张图片。",
        error: true
      });
      return;
    }

    if (options.appendUser !== false) {
      appendMessage({
        id: createId("user"),
        role: "user",
        text: payload.prompt || "请根据上传图片生成或修改图片。",
        attachments: payload.images
      });
    }

    if (!retryPayload) {
      setPrompt("");
      setAttachments([]);
    }

    const assistantId = createId("assistant");
    const startedAt = performance.now();
    appendMessage({
      id: assistantId,
      role: "assistant",
      text: "",
      status: directImage ? "正在用上下文调用 Image2 生成/编辑" : "正在连接流式响应",
      isGeneratingImage: directImage
    });

    setBusy(true);
    startProgressTimer(assistantId);

    try {
      await streamChat(payload, assistantId);
      updateMessage(assistantId, { durationMs: elapsedMs(startedAt) });
    } catch (error) {
      const failedRequest: RetryRequest = {
        directImage,
        payload: clonePayload(payload)
      };
      updateMessage(assistantId, {
        text: error instanceof Error ? error.message : "请求失败，请检查 API Key、模型权限或网络。",
        status: "",
        error: true,
        durationMs: elapsedMs(startedAt),
        isGeneratingImage: false,
        previewImage: undefined,
        retry: failedRequest
      });
    } finally {
      stopProgressTimer();
      setBusy(false);
    }
  }

  async function streamChat(payload: ChatPayload, assistantId: string) {
    const response = await fetch("/api/chat-stream", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok || !response.body) {
      const json = await response.json().catch(() => ({}));
      throw new Error(json.error || "流式请求失败。");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let streamedText = "";
    let imageCount = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() || "";

      for (const chunk of chunks) {
        const event = parseSseChunk(chunk);
        if (!event) continue;

        if (event.event === "status") {
          updateMessage(assistantId, { status: event.data.message || "正在生成" });
        }

        if (event.event === "text_delta") {
          streamedText += event.data.delta || "";
          updateMessage(assistantId, { text: streamedText, status: "持续接收模型输出" });
        }

        if (event.event === "partial_image" && event.data.b64_json) {
          updateMessage(assistantId, {
            status: "收到图片预览片段，继续生成最终图片",
            isGeneratingImage: true,
            previewImage: normalizePreviewImage(event.data.b64_json, event.data.mimeType)
          });
        }

        if (event.event === "image_generating") {
          updateMessage(assistantId, {
            status: event.data.message || "正在生成图片预览",
            isGeneratingImage: true
          });
        }

        if (event.event === "images") {
          const nextImages = normalizeGeneratedImages(event.data.images || [], imageCount);
          imageCount += nextImages.length;
          updateMessage(assistantId, (message) => ({
            ...message,
            status: "图片已返回，正在整理结果",
            isGeneratingImage: false,
            previewImage: undefined,
            images: [...(message.images || []), ...nextImages]
          }));
        }

        if (event.event === "final") {
          const finalImages = normalizeGeneratedImages(event.data.images || [], imageCount);
          if (event.data.id) {
            setPreviousResponseId(event.data.id);
            setStoredValue("previousResponseId", event.data.id);
          }
          updateMessage(assistantId, (message) => ({
            ...message,
            text: streamedText || event.data.text || message.text || "生成完成。",
            status: "",
            isGeneratingImage: false,
            previewImage: undefined,
            images: message.images?.length ? message.images : finalImages
          }));
        }

        if (event.event === "error") {
          throw new Error(event.data.error || "生成失败，请重试。");
        }
      }
    }

    updateMessage(assistantId, (message) => ({
      ...message,
      text: message.text || (message.images?.length ? "生成完成。" : "生成完成。"),
      status: "",
      isGeneratingImage: false,
      previewImage: undefined
    }));
  }

  function startProgressTimer(messageId: string) {
    const startedAt = Date.now();
    stopProgressTimer();
    progressTimerRef.current = window.setInterval(() => {
      const seconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
      updateMessage(messageId, (message) => {
        if (!message.status || message.error) return message;
        const base = message.status.replace(/ · \d+s$/, "");
        return { ...message, status: `${base} · ${seconds}s` };
      });
    }, 1000);
  }

  function stopProgressTimer() {
    if (progressTimerRef.current) {
      window.clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  }

  function retry(request: RetryRequest) {
    setMessages((current) => current.filter((message) => message.retry !== request));
    void sendChat(request.directImage, request.payload, { appendUser: false });
  }

  return (
    <main className="app-shell">
      <SettingsPanel settings={settings} onChange={setSettings} onClearContext={clearContext} />

      <section className="workspace">
        <div className="chat-header">
          <div>
            <h2>对话工作台</h2>
            <p>{contextText}</p>
          </div>
        </div>

        <ChatLog messages={messages} onRetry={retry} onOpenImage={setLightbox} />

        <Composer
          busy={busy}
          prompt={prompt}
          attachments={attachments}
          onPromptChange={setPrompt}
          onAttachmentsChange={setAttachments}
          onSend={(directImage) => void sendChat(directImage)}
          onOpenImage={setLightbox}
        />
      </section>

      <Lightbox image={lightbox} onClose={() => setLightbox(null)} />
    </main>
  );
}

function normalizeGeneratedImages(images: GeneratedImage[], offset = 0) {
  return images.map((image, index) => ({
    ...image,
    id: image.id || createId("image"),
    name: image.name || `image2-${offset + index + 1}.${(image.mimeType || "image/png").includes("jpeg") ? "jpg" : "png"}`
  }));
}

function normalizePreviewImage(b64Json: unknown, mimeType: unknown): GeneratedImage {
  return {
    id: createId("preview"),
    name: "image2-preview.png",
    b64_json: String(b64Json),
    mimeType: typeof mimeType === "string" ? mimeType : "image/png",
    preview: true
  };
}

function sanitizeMessageForStorage(message: ChatMessage): ChatMessage {
  return {
    id: message.id,
    role: message.role,
    text: message.text,
    error: message.error,
    durationMs: message.durationMs,
    images: message.images,
    attachments: message.attachments
  };
}

function restoreStoredMessage(message: ChatMessage): ChatMessage {
  return {
    ...message,
    status: "",
    retry: undefined,
    previewImage: undefined,
    isGeneratingImage: false
  };
}

function elapsedMs(startedAt: number) {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

function parseSseChunk(chunk: string) {
  const lines = chunk.split("\n");
  let event = "message";
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }

  if (!dataLines.length) return null;

  try {
    return {
      event,
      data: JSON.parse(dataLines.join("\n"))
    };
  } catch {
    return null;
  }
}
