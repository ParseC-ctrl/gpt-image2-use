import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export type StoredConversation = {
  messages: unknown[];
  previousResponseId: string;
  updatedAt: string;
};

const emptyConversation: StoredConversation = {
  messages: [],
  previousResponseId: "",
  updatedAt: ""
};

export function createConversationStore(rootDir: string) {
  const storageDir = path.join(rootDir, "storage");
  const conversationPath = path.join(storageDir, "conversation.json");

  async function readConversation(): Promise<StoredConversation> {
    try {
      const raw = await readFile(conversationPath, "utf8");
      const parsed = JSON.parse(raw) as Partial<StoredConversation>;
      return {
        messages: Array.isArray(parsed.messages) ? parsed.messages : [],
        previousResponseId: typeof parsed.previousResponseId === "string" ? parsed.previousResponseId : "",
        updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : ""
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyConversation;
      throw error;
    }
  }

  async function writeConversation(payload: Partial<StoredConversation>) {
    await mkdir(storageDir, { recursive: true });
    const conversation: StoredConversation = {
      messages: Array.isArray(payload.messages) ? payload.messages : [],
      previousResponseId: typeof payload.previousResponseId === "string" ? payload.previousResponseId : "",
      updatedAt: new Date().toISOString()
    };
    await writeFile(conversationPath, JSON.stringify(conversation, null, 2), "utf8");
    return conversation;
  }

  async function clearConversation() {
    await rm(conversationPath, { force: true });
    return emptyConversation;
  }

  return {
    readConversation,
    writeConversation,
    clearConversation
  };
}
