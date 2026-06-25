import type { NextFunction, Request, Response, Router } from "express";
import express from "express";
import {
  HttpError,
  buildResponsesBody,
  callOpenAI,
  callOpenAIMultipart,
  callOpenAIStream,
  dataUrlToBlob,
  extractResponseData,
  requireApiKey,
  type UploadedImage
} from "./openai";
import { createConversationStore } from "./conversationStore";

type ChatRequestBody = {
  apiKey?: string;
  baseUrl?: string;
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

export function createApiRouter(rootDir: string): Router {
  const router = express.Router();
  const conversationStore = createConversationStore(rootDir);

  router.get("/conversation", async (_req, res, next) => {
    try {
      res.json(await conversationStore.readConversation());
    } catch (error) {
      next(error);
    }
  });

  router.put("/conversation", async (req, res, next) => {
    try {
      res.json(await conversationStore.writeConversation(req.body));
    } catch (error) {
      next(error);
    }
  });

  router.delete("/conversation", async (_req, res, next) => {
    try {
      res.json(await conversationStore.clearConversation());
    } catch (error) {
      next(error);
    }
  });

  router.post("/chat", async (req, res, next) => {
    try {
      const body = req.body as ChatRequestBody;
      const apiKey = requireApiKey(body.apiKey);
      const responseJson = await callOpenAI({
        apiKey,
        baseUrl: body.baseUrl,
        body: {
          ...buildResponsesBody(body),
          stream: false
        }
      });

      res.json(extractResponseData(responseJson, body.outputFormat));
    } catch (error) {
      next(error);
    }
  });

  router.post("/chat-stream", async (req, res) => {
    const body = req.body as ChatRequestBody;

    sendSseHeaders(res);

    try {
      const apiKey = requireApiKey(body.apiKey);
      const outputFormat = body.outputFormat || "png";

      writeSse(res, "status", { message: "请求已发送，等待模型响应..." });

      await callOpenAIStream({
        apiKey,
        baseUrl: body.baseUrl,
        body: buildResponsesBody(body),
        async onEvent(event) {
          handleOpenAIStreamEvent(res, event, outputFormat);
        }
      });

      writeSse(res, "done", {});
    } catch (error) {
      const normalized = normalizeError(error);
      writeSse(res, "error", {
        error: normalized.message,
        details: normalized.details
      });
    } finally {
      res.end();
    }
  });

  router.post("/direct-image", async (req, res, next) => {
    try {
      const body = req.body as ChatRequestBody;
      const apiKey = requireApiKey(body.apiKey);
      const images = body.images || [];
      const model = body.imageModel || "gpt-image-2";
      const prompt = body.prompt || "Generate or edit the image according to the uploaded image and conversation context.";
      const size = body.size || "1024x1024";
      const quality = body.quality || "auto";
      const outputFormat = body.outputFormat || "png";

      if (images.length) {
        const form = new FormData();
        form.append("model", model);
        form.append("prompt", prompt);
        form.append("size", size);
        form.append("quality", quality);
        form.append("output_format", outputFormat);

        for (const [index, image] of images.slice(0, 8).entries()) {
          if (!image?.dataUrl) continue;
          const blob = dataUrlToBlob(image.dataUrl);
          form.append("image[]", blob, image.name || `image2-${index + 1}.png`);
        }

        const responseJson = await callOpenAIMultipart({
          apiKey,
          baseUrl: body.baseUrl,
          form,
          endpoint: "/images/edits"
        });

        res.json(extractResponseData(responseJson, outputFormat));
        return;
      }

      const responseJson = await callOpenAI({
        apiKey,
        baseUrl: body.baseUrl,
        endpoint: "/images/generations",
        body: {
          model,
          prompt,
          size,
          quality,
          output_format: outputFormat
        }
      });

      res.json(extractResponseData(responseJson, outputFormat));
    } catch (error) {
      next(error);
    }
  });

  return router;
}

export function sendJsonError(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  const normalized = normalizeError(error);
  res.status(normalized.status).json({
    error: normalized.message,
    details: normalized.details ?? null
  });
}

function sendSseHeaders(res: Response) {
  res.status(200);
  res.set({
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no"
  });
  res.flushHeaders();
}

function writeSse(res: Response, event: string, payload: Record<string, unknown> = {}) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function handleOpenAIStreamEvent(res: Response, event: Record<string, unknown>, outputFormat: string) {
  const type = typeof event.type === "string" ? event.type : "";
  const item = event.item as { type?: string } | undefined;

  if (
    (type === "response.output_item.added" || type === "response.output_item.in_progress") &&
    item?.type === "image_generation_call"
  ) {
    writeSse(res, "image_generating", { message: "正在生成图片预览..." });
    return;
  }

  if (type.endsWith(".created") || type.endsWith(".in_progress")) {
    writeSse(res, "status", { message: "模型正在处理上下文..." });
    return;
  }

  if (
    (type === "response.output_text.delta" || type === "response.text.delta") &&
    typeof event.delta === "string"
  ) {
    writeSse(res, "text_delta", { delta: event.delta });
    return;
  }

  if (type === "response.image_generation_call.generating" || type === "response.image_generation_call.in_progress") {
    writeSse(res, "image_generating", { message: "正在生成图片预览..." });
    writeSse(res, "status", { message: "正在生成图片..." });
    return;
  }

  if (type === "response.image_generation_call.partial_image") {
    const image = event.image as { b64_json?: string } | undefined;
    writeSse(res, "partial_image", {
      b64_json:
        pickString(event.partial_image_b64) ||
        pickString(event.b64_json) ||
        pickString(image?.b64_json) ||
        pickString(event.result),
      mimeType: outputFormat === "jpeg" ? "image/jpeg" : "image/png"
    });
    return;
  }

  if (type === "response.output_item.done" && event.item && typeof event.item === "object") {
    const data = extractResponseData({ output: [event.item] }, outputFormat);
    if (data.images.length) writeSse(res, "images", { images: data.images });
    return;
  }

  if (type === "response.completed" && event.response && typeof event.response === "object") {
    const data = extractResponseData(event.response as Record<string, unknown>, outputFormat);
    writeSse(res, "final", data);
    return;
  }

  if (type === "response.failed" || type === "response.incomplete") {
    const response = event.response as { error?: { message?: string } } | undefined;
    const error = event.error as { message?: string } | undefined;
    writeSse(res, "error", {
      error: response?.error?.message || error?.message || "生成未完成，请重试。"
    });
  }
}

function normalizeError(error: unknown) {
  if (error instanceof HttpError) {
    return {
      status: error.status,
      message: error.message,
      details: error.details
    };
  }

  if (error instanceof Error) {
    return {
      status: 500,
      message: error.message || "服务端出错",
      details: null
    };
  }

  return {
    status: 500,
    message: "服务端出错",
    details: null
  };
}

function pickString(value: unknown) {
  return typeof value === "string" ? value : "";
}
