import { Router, type IRouter } from "express";
import { addMemory, getMemorySummary } from "../lib/assistant-memory";
import { askGemini } from "../lib/gemini";
import { listProducts } from "../lib/product-store";
import { getTelegramArchiveStatus, getTelegramStatus } from "../telegram";

const router: IRouter = Router();

router.get("/assistant/telegram-status", (_req, res) => {
  res.json(getTelegramStatus());
});

router.get("/assistant/archive-status", async (_req, res) => {
  res.json(await getTelegramArchiveStatus());
});

router.get("/assistant/memory", async (req, res) => {
  const limit = Number(req.query.limit ?? 100);
  res.json(await getMemorySummary(limit));
});

router.get("/products", async (_req, res) => {
  res.json({ products: await listProducts() });
});

router.post("/assistant/chat", async (req, res) => {
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  const history = Array.isArray(req.body?.history)
    ? req.body.history
        .filter(
          (item: unknown): item is { role: "user" | "model"; text: string } =>
            typeof item === "object" &&
            item !== null &&
            (((item as { role?: string }).role === "user") ||
              (item as { role?: string }).role === "model") &&
            typeof (item as { text?: unknown }).text === "string",
        )
        .slice(-12)
    : [];
  if (!message) {
    res.status(400).json({ error: "message is required" });
    return;
  }
  const reply = await askGemini(message, history);
  await addMemory({ chatId: "website", kind: "message", text: message });
  res.json({ reply });
});

router.post("/assistant/command", async (req, res) => {
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (!text) {
    res.status(400).json({ error: "text is required" });
    return;
  }
  const entry = await addMemory({
    chatId: "website",
    kind: "message",
    text,
  });
  res.status(201).json(entry);
});

export default router;