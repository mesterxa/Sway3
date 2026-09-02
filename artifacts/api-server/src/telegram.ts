import { ReplitConnectors } from "@replit/connectors-sdk";
import { logger } from "./lib/logger";
import { addMemory, getMemory } from "./lib/assistant-memory";

type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number | string };
    text?: string;
    caption?: string;
    photo?: Array<{ file_id: string; width: number; height: number }>;
    document?: { file_id: string; file_name?: string; mime_type?: string };
    from?: { first_name?: string; username?: string };
  };
};

type Action =
  | { kind: "reminder"; title: string; date: string }
  | { kind: "debt"; person: string; amount: number; direction: "owedToMe" | "iOwe" }
  | { kind: "note"; text: string };

const connectors = new ReplitConnectors();
let polling = false;
let offset = 0;
let botUsername = "";
let lastError: string | null = null;
let lastUpdateAt: string | null = null;

const tomorrow = () => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString();
};

const parseText = (value: string): Action => {
  const amountMatch = value.match(/(\d[\d\s.]*)/);
  const amount = amountMatch ? Number(amountMatch[1].replace(/[^\d]/g, "")) : 0;
  if (/ذكرني|موعد|اتصل|تابع/.test(value)) {
    return {
      kind: "reminder",
      title: value.replace(/^ذكرني\s*(أن|بأن)?\s*/u, "").trim() || value,
      date: /غدًا|غدا/.test(value) ? tomorrow() : new Date().toISOString(),
    };
  }
  if (/دين|لي عند|عليّ|علي /.test(value) && amount) {
    const person =
      value
        .replace(/.*?(على|من|لدى|لي عند)\s*/u, "")
        .replace(amountMatch?.[0] ?? "", "")
        .trim() || "شخص غير مسمى";
    return {
      kind: "debt",
      person,
      amount,
      direction: /عليّ|علي /.test(value) ? "iOwe" : "owedToMe",
    };
  }
  return { kind: "note", text: value };
};

function getWebAppUrl() {
  const configuredUrl = process.env.TELEGRAM_WEB_APP_URL;
  if (configuredUrl) return configuredUrl;
  const domain =
    process.env.REPLIT_DEV_DOMAIN ??
    process.env.REPLIT_DOMAINS?.split(",")[0];
  return domain ? `https://${domain}/` : "https://replit.com/";
}

async function sendMessage(
  chatId: number | string,
  text: string,
  replyTo?: number,
  withWebApp = false,
) {
  await connectors.proxy("telegram", "/sendMessage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      ...(replyTo ? { reply_parameters: { message_id: replyTo } } : {}),
      ...(withWebApp
        ? {
            reply_markup: {
              keyboard: [
                [{ text: "فتح مساعد الساعات", web_app: { url: getWebAppUrl() } }],
              ],
              resize_keyboard: true,
              is_persistent: true,
            },
          }
        : {}),
    }),
  });
}

async function archiveMedia(
  fileId: string,
  kind: "photo" | "file",
  caption: string,
) {
  const archiveChatId = process.env.TELEGRAM_ARCHIVE_CHAT_ID;
  if (!archiveChatId) return null;
  try {
    const method = kind === "photo" ? "/sendPhoto" : "/sendDocument";
    const response = await connectors.proxy("telegram", method, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: archiveChatId,
        [kind === "photo" ? "photo" : "document"]: fileId,
        caption: caption.slice(0, 1024),
      }),
    });
    const payload = (await response.json()) as {
      ok: boolean;
      result?: { photo?: Array<{ file_id: string }>; document?: { file_id: string } };
    };
    if (!payload.ok) return null;
    return kind === "photo"
      ? payload.result?.photo?.at(-1)?.file_id ?? fileId
      : payload.result?.document?.file_id ?? fileId;
  } catch (error) {
    logger.warn({ err: error }, "Could not archive Telegram media");
    return null;
  }
}

async function processUpdate(update: TelegramUpdate) {
  const message = update.message;
  if (!message) return;
  const chatId = String(message.chat.id);
  lastUpdateAt = new Date().toISOString();

  if (message.photo?.length || message.document) {
    const kind = message.photo?.length ? "photo" : "file";
    const largestPhoto = message.photo?.[message.photo.length - 1];
    const sourceFileId = largestPhoto?.file_id ?? message.document?.file_id;
    if (!sourceFileId) return;
    const caption = message.caption?.trim() || "صورة طلبية بدون وصف";
    const archiveFileId = await archiveMedia(sourceFileId, kind, caption);
    await addMemory({
      chatId,
      kind,
      text: caption,
      data: {
        fileId: sourceFileId,
        archiveFileId: archiveFileId ?? undefined,
        caption,
        fileName: message.document?.file_name,
        mimeType: message.document?.mime_type,
      },
    });
    await sendMessage(
      message.chat.id,
      archiveFileId
        ? "وصلت الطلبية وحفظتها في أرشيف Telegram الخاص.\nأرسل معها اسم الزبون أو المبلغ في الوصف، وسأجهزها للتحليل والتنظيم."
        : "وصلت الطلبية وحفظتها في ذاكرتك.\nللحفظ في أرشيف Telegram الخاص، أضف معرّف القناة في إعدادات المشروع.",
      message.message_id,
    );
    return;
  }

  const text = message.text?.trim();
  if (!text) return;
  if (text === "/start" || text === "/help") {
    await sendMessage(
      message.chat.id,
      "أهلًا بك في مساعد الساعات.\n\nأرسل أي شيء وسأحفظه لك، مثل:\n• ذكرني غدًا بالاتصال بمحمد\n• سجل دين على محمد 5000\n• الزبون يحب الساعات السوداء\n\nوأرسل صور الطلبيات مع وصف مختصر. استخدم /memory لعرض آخر ما حفظته.",
      message.message_id,
      true,
    );
    return;
  }
  if (text === "/memory") {
    const entries = await getMemory(8);
    const response =
      entries.length === 0
        ? "ذاكرتك فارغة حاليًا."
        : `آخر ما حفظته:\n${entries.map((entry, index) => `${index + 1}. ${entry.text}`).join("\n")}`;
    await sendMessage(message.chat.id, response, message.message_id);
    return;
  }

  const action = parseText(text);
  if (action.kind === "reminder") {
    await addMemory({
      chatId,
      kind: "reminder",
      text: action.title,
      data: { title: action.title, date: action.date },
    });
    await sendMessage(message.chat.id, `تم حفظ الموعد: ${action.title}`, message.message_id);
  } else if (action.kind === "debt") {
    await addMemory({
      chatId,
      kind: "debt",
      text: `${action.person} · ${action.amount.toLocaleString("ar-DZ")} دج`,
      data: { amount: action.amount, direction: action.direction, person: action.person },
    });
    await sendMessage(message.chat.id, "تم تسجيل الدين في ذاكرتك.", message.message_id);
  } else {
    await addMemory({ chatId, kind: "note", text: action.text });
    await sendMessage(message.chat.id, "حفظت ذلك في ذاكرتك.", message.message_id);
  }
}

async function poll() {
  while (polling) {
    try {
      const response = await connectors.proxy(
        "telegram",
        `/getUpdates?timeout=25&offset=${offset}&allowed_updates=${encodeURIComponent(JSON.stringify(["message"]))}`,
        { method: "GET" },
      );
      const payload = (await response.json()) as {
        ok: boolean;
        result?: TelegramUpdate[];
        description?: string;
      };
      if (!payload.ok) throw new Error(payload.description || "Telegram update request failed");
      for (const update of payload.result ?? []) {
        offset = Math.max(offset, update.update_id + 1);
        await processUpdate(update);
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Unknown Telegram error";
      logger.error({ err: error }, "Telegram polling error");
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

export async function startTelegramWorker() {
  if (polling) return;
  try {
    const response = await connectors.proxy("telegram", "/getMe", { method: "GET" });
    const payload = (await response.json()) as {
      ok: boolean;
      result?: { username?: string };
      description?: string;
    };
    if (!payload.ok) throw new Error(payload.description || "Telegram connection failed");
    botUsername = payload.result?.username ?? "";
    polling = true;
    logger.info({ botUsername }, "Telegram assistant connected");
    void poll();
  } catch (error) {
    lastError = error instanceof Error ? error.message : "Telegram connection failed";
    logger.error({ err: error }, "Could not start Telegram assistant");
  }
}

export function getTelegramStatus() {
  return {
    connected: polling,
    botUsername: botUsername ? `@${botUsername}` : null,
    lastUpdateAt,
    lastError,
  };
}

export async function getTelegramArchiveStatus() {
  const archiveChatId = process.env.TELEGRAM_ARCHIVE_CHAT_ID;
  if (!archiveChatId) {
    return {
      configured: false,
      reachable: false,
      title: null,
      lastError: "TELEGRAM_ARCHIVE_CHAT_ID is not configured",
    };
  }

  try {
    const response = await connectors.proxy(
      "telegram",
      `/getChat?chat_id=${encodeURIComponent(archiveChatId)}`,
      { method: "GET" },
    );
    const payload = (await response.json()) as {
      ok: boolean;
      result?: { title?: string; username?: string };
      description?: string;
    };
    return {
      configured: true,
      reachable: payload.ok,
      title: payload.ok
        ? payload.result?.title ?? payload.result?.username ?? "Telegram archive"
        : null,
      lastError: payload.ok ? null : payload.description ?? "Telegram rejected the archive channel",
    };
  } catch (error) {
    return {
      configured: true,
      reachable: false,
      title: null,
      lastError: error instanceof Error ? error.message : "Telegram archive check failed",
    };
  }
}