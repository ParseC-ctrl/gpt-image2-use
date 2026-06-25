export type UploadedImage = {
  id: string;
  name: string;
  type: string;
  dataUrl: string;
};

export type GeneratedImage = {
  id?: string;
  name?: string;
  b64_json: string;
  mimeType: string;
  revisedPrompt?: string;
  preview?: boolean;
};

export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  status?: string;
  error?: boolean;
  durationMs?: number;
  images?: GeneratedImage[];
  previewImage?: GeneratedImage;
  isGeneratingImage?: boolean;
  attachments?: UploadedImage[];
  retry?: RetryRequest;
};

export type Settings = {
  apiKey: string;
  baseUrl: string;
  reasoningModel: string;
  imageModel: string;
  size: string;
  quality: string;
  outputFormat: "png" | "jpeg";
};

export type ChatPayload = Settings & {
  prompt: string;
  images: UploadedImage[];
  previousResponseId: string;
  forceImage?: boolean;
};

export type RetryRequest = {
  directImage: boolean;
  payload: ChatPayload;
};

export type LightboxImage = {
  src: string;
  name: string;
  mimeType: string;
};

export type ServerConversation = {
  messages: ChatMessage[];
  previousResponseId: string;
  updatedAt?: string;
};
