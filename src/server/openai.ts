const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";

export type UploadedImage = {
  name?: string;
  type?: string;
  dataUrl?: string;
};

export type ImageResult = {
  b64_json: string;
  mimeType: string;
  revisedPrompt?: string;
};

export type ResponseData = {
  id: string | null;
  text: string;
  images: ImageResult[];
};

type ChatBodyInput = {
  prompt?: string;
  images?: UploadedImage[];
  previousResponseId?: string;
  reasoningModel?: string;
  imageModel?: string;
  size?: string;
  quality?: string;
  outputFormat?: string;
  forceImage?: boolean;
};

export class HttpError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status = 500, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function requireApiKey(apiKey: unknown) {
  if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) {
    throw new HttpError("请先在页面右上角填入有效的 API Key 或访问令牌。", 400);
  }
  return apiKey.trim();
}

export function normalizeBaseUrl(baseUrl: unknown) {
  const rawValue = typeof baseUrl === "string" && baseUrl.trim()
    ? baseUrl.trim()
    : DEFAULT_OPENAI_BASE_URL;

  let url: URL;
  try {
    url = new URL(rawValue);
  } catch {
    throw new HttpError("Base URL 格式无效，请填写 http 或 https 地址。", 400);
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new HttpError("Base URL 只支持 http 或 https。", 400);
  }

  if (url.pathname === "/" || url.pathname === "") {
    url.pathname = "/v1";
  }

  return url.toString().replace(/\/$/, "");
}

export function openAIUrl(baseUrl: unknown, endpoint: string) {
  return `${normalizeBaseUrl(baseUrl)}${endpoint}`;
}

export function makeConversationPrompt({
  prompt,
  outputFormat,
  forceImage
}: {
  prompt?: string;
  outputFormat: string;
  forceImage?: boolean;
}) {
  return [
    "你是一个通用 Image2 图像对话助手。",
    "根据用户的文字和上传图片完成图像生成、编辑、重绘、风格转换、标注或分析。",
    "多轮对话中要优先保留用户已经确认的主体、构图、风格和修改要求。",
    `用户希望输出图片格式：${outputFormat === "jpeg" ? "JPG/JPEG" : "PNG"}。`,
    "如果上传图片细节不清晰，请明确说明不确定处，不要编造精确内容。",
    "如果需要生成图片，请直接调用图像生成工具；如果需要解释或分析，也给出简洁文字。",
    forceImage ? "本轮来自“单次 Image2”按钮：必须调用图像生成工具生成或编辑图片，并把上一轮生成结果作为可延续的上下文。" : "",
    `用户本轮要求：${prompt || "请根据上传图片和上下文生成或修改图片。"}`
  ].filter(Boolean).join("\n");
}

export function extractResponseData(responseJson: Record<string, unknown>, preferredFormat = "png"): ResponseData {
  const images: ImageResult[] = [];
  const texts: string[] = [];

  if (typeof responseJson.output_text === "string") {
    texts.push(responseJson.output_text);
  }

  function visit(value: unknown) {
    if (!value || typeof value !== "object") return;

    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }

    const node = value as Record<string, unknown>;
    const nodeType = typeof node.type === "string" ? node.type : "";

    if (nodeType === "output_text" && typeof node.text === "string") {
      texts.push(node.text);
    }

    if (
      typeof node.result === "string" &&
      (nodeType === "image_generation_call" || node.result.length > 200)
    ) {
      const outputFormat = typeof node.output_format === "string" ? node.output_format : preferredFormat;
      images.push({
        b64_json: node.result,
        mimeType: outputFormat === "jpeg" ? "image/jpeg" : "image/png",
        revisedPrompt: typeof node.revised_prompt === "string" ? node.revised_prompt : ""
      });
    }

    if (typeof node.b64_json === "string") {
      images.push({
        b64_json: node.b64_json,
        mimeType: typeof node.mime_type === "string"
          ? node.mime_type
          : preferredFormat === "jpeg"
            ? "image/jpeg"
            : "image/png",
        revisedPrompt: typeof node.revised_prompt === "string" ? node.revised_prompt : ""
      });
    }

    Object.values(node).forEach(visit);
  }

  visit(responseJson.output ?? responseJson.data ?? responseJson);

  return {
    id: typeof responseJson.id === "string" ? responseJson.id : null,
    text: [...new Set(texts)].join("\n\n").trim(),
    images
  };
}

export function buildResponsesBody({
  prompt,
  images = [],
  previousResponseId,
  reasoningModel = "gpt-5.5",
  imageModel = "gpt-image-2",
  size = "1024x1024",
  quality = "auto",
  outputFormat = "png",
  forceImage
}: ChatBodyInput) {
  const content: Array<Record<string, string>> = [
    {
      type: "input_text",
      text: makeConversationPrompt({ prompt, outputFormat, forceImage })
    }
  ];

  for (const image of images.slice(0, 8)) {
    if (image?.dataUrl) {
      content.push({
        type: "input_image",
        image_url: image.dataUrl
      });
    }
  }

  const imageTool: Record<string, string> = {
    type: "image_generation",
    size,
    quality,
    output_format: outputFormat
  };

  if (imageModel) imageTool.model = imageModel;

  const body: Record<string, unknown> = {
    model: reasoningModel,
    stream: true,
    input: [
      {
        role: "user",
        content
      }
    ],
    tools: [imageTool]
  };

  if (previousResponseId) body.previous_response_id = previousResponseId;
  return body;
}

export async function callOpenAI({
  apiKey,
  baseUrl,
  body,
  endpoint = "/responses"
}: {
  apiKey: string;
  baseUrl: unknown;
  body: unknown;
  endpoint?: string;
}) {
  const response = await fetch(openAIUrl(baseUrl, endpoint), {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const json = await readOpenAIJson(response);
  if (!response.ok) throwOpenAIError(response.status, json);
  return json;
}

export async function callOpenAIStream({
  apiKey,
  baseUrl,
  body,
  endpoint = "/responses",
  onEvent
}: {
  apiKey: string;
  baseUrl: unknown;
  body: unknown;
  endpoint?: string;
  onEvent: (event: Record<string, unknown>, eventName: string) => Promise<void> | void;
}) {
  const response = await fetch(openAIUrl(baseUrl, endpoint), {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const json = await readOpenAIJson(response);
    throwOpenAIError(response.status, json);
  }

  if (!response.body) throw new HttpError("OpenAI API 未返回可读取的流。", 502);

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() || "";

    for (const chunk of chunks) {
      const event = parseSseChunk(chunk);
      if (!event) continue;
      await onEvent(event.data, event.event);
    }
  }

  if (buffer.trim()) {
    const event = parseSseChunk(buffer);
    if (event) await onEvent(event.data, event.event);
  }
}

export async function callOpenAIMultipart({
  apiKey,
  baseUrl,
  form,
  endpoint
}: {
  apiKey: string;
  baseUrl: unknown;
  form: FormData;
  endpoint: string;
}) {
  const response = await fetch(openAIUrl(baseUrl, endpoint), {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`
    },
    body: form
  });

  const json = await readOpenAIJson(response);
  if (!response.ok) throwOpenAIError(response.status, json);
  return json;
}

export function dataUrlToBlob(dataUrl: string) {
  const match = /^data:(.+?);base64,(.+)$/.exec(dataUrl || "");
  if (!match) throw new HttpError("上传图片格式无效。", 400);

  const [, mimeType, base64] = match;
  const bytes = Buffer.from(base64, "base64");
  return new Blob([bytes], { type: mimeType });
}

async function readOpenAIJson(response: Response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
}

function throwOpenAIError(status: number, json: Record<string, unknown>) {
  const error = json.error as { message?: string } | undefined;
  const message =
    error?.message ||
    (typeof json.message === "string" ? json.message : "") ||
    `OpenAI API 请求失败：HTTP ${status}`;
  throw new HttpError(message, status, json);
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
  const rawData = dataLines.join("\n");
  if (rawData === "[DONE]") return { event: "done", data: { type: "done" } };

  try {
    return {
      event,
      data: JSON.parse(rawData) as Record<string, unknown>
    };
  } catch {
    return {
      event,
      data: { type: event, raw: rawData }
    };
  }
}
