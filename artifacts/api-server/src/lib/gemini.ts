import { logger } from "./logger";

type GeminiPart = { text?: string; inline_data?: { mime_type: string; data: string } };
type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
  error?: { message?: string };
};

const endpoint =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

async function request(contents: Array<{ role: "user" | "model"; parts: GeminiPart[] }>, system: string) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not configured");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(`${endpoint}?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents,
        generationConfig: { maxOutputTokens: 8192 },
      }),
    });
    const payload = (await response.json()) as GeminiResponse;
    if (!response.ok) throw new Error(payload.error?.message ?? "Gemini request failed");
    return payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim() ?? "";
  } finally {
    clearTimeout(timeout);
  }
}

export async function askGemini(
  message: string,
  history: Array<{ role: "user" | "model"; text: string }> = [],
) {
  try {
    return await request(
      [
        ...history.slice(-12).map((item) => ({ role: item.role, parts: [{ text: item.text }] })),
        { role: "user", parts: [{ text: message }] },
      ],
      [
        "أنت مساعد تجاري عربي لبائع ساعات في الجزائر.",
        "تحدث بالعربية الواضحة وافهم الدارجة الجزائرية. كن عمليًا ومختصرًا.",
        "الموقع مخصص لعرض المنتجات والطلبات، وتيليغرام هو مساحة الأوامر والإدارة.",
        "لا تطلب أبدًا كلمات المرور أو مفاتيح API أو التوكنات داخل المحادثة.",
      ].join("\n"),
    );
  } catch (error) {
    logger.warn({ err: error }, "Gemini chat request failed");
    return "تعذر الاتصال بـ Gemini الآن. تأكد من إعداد GEMINI_API_KEY ثم أعد المحاولة.";
  }
}

export async function analyzeProductMedia(
  bytes: Buffer,
  mimeType: string,
  caption: string,
) {
  const raw = await request(
    [
      {
        role: "user",
        parts: [
          {
            inline_data: {
              mime_type: mimeType,
              data: bytes.toString("base64"),
            },
          },
          {
            text: `${caption}\nحلل هذه الوسائط كمنتج ساعة. أخرج JSON فقط بهذا الشكل: {"name":"","price":0,"description":"","category":"ساعة","stock":1}. إذا لم يظهر السعر اجعله 0 ولا تخترع رقمًا.`,
          },
        ],
      },
    ],
    [
      "أنت محلل كتالوج منتجات. استخرج ما يظهر في الصورة أو الفيديو المرفق.",
      "اكتب وصفًا تسويقيًا صادقًا بالعربية. لا تخترع العلامة أو السعر إن لم يظهر.",
      "أخرج JSON صالحًا فقط.",
    ].join("\n"),
  );
  const parsed = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, ""));
  return {
    name: typeof parsed.name === "string" && parsed.name.trim() ? parsed.name.trim() : "ساعة جديدة",
    price: typeof parsed.price === "number" && parsed.price > 0 ? parsed.price : 0,
    description: typeof parsed.description === "string" ? parsed.description.trim() : "",
    category: typeof parsed.category === "string" && parsed.category.trim() ? parsed.category.trim() : "ساعة",
    stock: typeof parsed.stock === "number" && parsed.stock > 0 ? Math.floor(parsed.stock) : 1,
  };
}
