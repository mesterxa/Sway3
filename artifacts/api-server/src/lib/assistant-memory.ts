import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type MemoryKind = "message" | "photo" | "reminder" | "debt" | "note";

export type MemoryEntry = {
  id: string;
  chatId: string;
  kind: MemoryKind;
  text: string;
  createdAt: string;
  data?: {
    amount?: number;
    direction?: "owedToMe" | "iOwe";
    title?: string;
    date?: string;
    fileId?: string;
    caption?: string;
    person?: string;
  };
};

type MemoryFile = {
  entries: MemoryEntry[];
};

const storagePath = path.resolve(
  process.env.ASSISTANT_MEMORY_FILE ?? "data/assistant-memory.json",
);

let memory: MemoryFile | null = null;
let writeChain = Promise.resolve();

async function loadMemory() {
  if (memory) return memory;
  try {
    memory = JSON.parse(await readFile(storagePath, "utf8")) as MemoryFile;
  } catch {
    memory = { entries: [] };
  }
  return memory;
}

function queueWrite(next: MemoryFile) {
  writeChain = writeChain
    .catch(() => undefined)
    .then(async () => {
      await mkdir(path.dirname(storagePath), { recursive: true });
      await writeFile(storagePath, JSON.stringify(next, null, 2), "utf8");
    });
  return writeChain;
}

export async function addMemory(entry: Omit<MemoryEntry, "id" | "createdAt">) {
  const current = await loadMemory();
  const next: MemoryFile = {
    entries: [
      {
        ...entry,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: new Date().toISOString(),
      },
      ...current.entries,
    ].slice(0, 10000),
  };
  memory = next;
  await queueWrite(next);
  return next.entries[0];
}

export async function getMemory(limit = 100) {
  const current = await loadMemory();
  return current.entries.slice(0, Math.min(Math.max(limit, 1), 500));
}

export async function getMemorySummary(limit = 500) {
  const entries = await getMemory(limit);
  return {
    entries,
    counts: {
      reminders: entries.filter((entry) => entry.kind === "reminder").length,
      debts: entries.filter((entry) => entry.kind === "debt").length,
      notes: entries.filter((entry) => entry.kind === "note").length,
      photos: entries.filter((entry) => entry.kind === "photo").length,
    },
  };
}