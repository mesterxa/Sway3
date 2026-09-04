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
  | { kind: "note"; text: string }
  | { kind: "memory" }
  | { kind: "apiHelp" }
  | { kind: "openApp" };

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

const normalizeArabic = (value: string) =>
  value
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[\u064B-\u065F]/g, "")
    .trim();

const parseText = (value: string): Action => {
  const normalized = normalizeArabic(value);
  const amountMatch = normalized.match(/(\d[\d\s.]*)/);
  const amount = amountMatch ? Number(amountMatch[1].replace(/[^\d]/g, "")) : 0;
  if (
    /ماذا\s+(?:حفظت|سجلت)|ما(?:ذا)?\s+(?:حفظت|سجلت)|اعرض(?:\s+لي)?\s+(?:الذاكرة|ما حفظت)|آخر ما حفظت|ذاكرتي/.test(
      normalized,
    )
  ) {
    return { kind: "memory" };
  }
  if (/\bapi\b|مفتاح api|توكن|رمز الوصول|مفتاح الدخول|اربط(?:\s+لي)?\s+(?:خدمة|api)/i.test(normalized)) {
    return { kind: "apiHelp" };
  }
  if (/افتح.*(?:التطبيق|المساعد|الواجهة)|واجهة التطبيق|mini app/i.test(normalized)) {
    return { kind: "openApp" };
  }
  if (/ذكرني|موعد|اتصل|تابع|لا تنس/.test(normalized)) {
    return {
      kind: "reminder",
      title: normalized.replace(/^ذكرني\s*(أن|بأن)?\s*/u, "").trim() || normalized,
      date: /غدًا|غدا|غد/.test(normalized) ? tomorrow() : new Date().toISOString(),
    };
  }
  if (/دين|لي عند|عليّ|علي /.test(normalized) && amount) {
    const person =
      normalized
        .replace(/.*?(على|من|لدى|لي عند)\s*/u, "")
        .replace(amountMatch?.[0] ?? "", "")
        .replace(/(?:دج|دينار|جنيه|ريال)\s*$/u, "")
        .trim() || "شخص غير مسمى";
    return {
      kind: "debt",
      person,
      amount,
      direction: /عليّ|علي /.test(normalized) ? "iOwe" : "owedToMe",
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

async function sendSavedMedia(
  chatId: number | string,
  kind: "photo" | "file",
  fileId: string,
  caption: string,
) {
  await connectors.proxy("telegram", kind === "photo" ? "/sendPhoto" : "/sendDocument", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      [kind === "photo" ? "photo" : "document"]: fileId,
      caption: caption.slice(0, 1024),
    }),
  });
}

async function sendMemory(chatId: number | string, replyTo?: number) {
  const entries = await getMemory(8);
  if (!entries.length) {
    await sendMessage(chatId, "ذاكرتك فارغة حاليًا. أرسل لي موعدًا أو دينًا أو ملاحظة وسأحفظه.", replyTo);
    return;
  }

  const labels: Record<string, string> = {
    reminder: "موعد",
    debt: "دين",
    note: "ملاحظة",
    photo: "صورة طلبية",
    file: "ملف",
    message: "رسالة",
  };
  await sendMessage(
    chatId,
    `وجدت ${entries.length} عناصر في ذاكرتك:\n${entries
      .map((entry, index) => `${index + 1}. [${labels[entry.kind] ?? entry.kind}] ${entry.text}`)
      .join("\n")}`,
    replyTo,
  );

  for (const entry of entries) {
    if ((entry.kind === "photo" || entry.kind === "file") && entry.data?.fileId) {
      try {
        await sendSavedMedia(
          chatId,
          entry.kind,
          entry.data.archiveFileId ?? entry.data.fileId,
          entry.text,
        );
      } catch (error) {
        logger.warn({ err: error }, "Could not resend saved Telegram media");
      }
    }
  }
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
    await sendMemory(message.chat.id, message.message_id);
    return;
  }

  const action = parseText(text);
  if (action.kind === "memory") {
    await sendMemory(message.chat.id, message.message_id);
  } else if (action.kind === "apiHelp") {
    await sendMessage(
      message.chat.id,
      "فهمت أنك تريد إضافة أو ربط API.\n\nلا ترسل مفتاح API أو التوكن داخل Telegram. اكتب اسم الخدمة فقط، مثل: Google Sheets أو Gemini، وسأجهز لك طريقة الربط الآمنة.",
      message.message_id,
    );
  } else if (action.kind === "openApp") {
    await sendMessage(
      message.chat.id,
      "هذه واجهة مساعد الساعات:",
      message.message_id,
      true,
    );
  } else if (action.kind === "reminder") {
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
    await sendMessage(
      message.chat.id,
      `حفظت هذه كملاحظة:\n«${action.text}»\n\nإذا كنت تقصد أمرًا مختلفًا، اكتب مثلًا: «ماذا حفظت؟» أو «ذكرني غدًا...»`,
      message.message_id,
    );
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