import { Router, type IRouter } from "express";
import { addMemory, getMemorySummary } from "../lib/assistant-memory";
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