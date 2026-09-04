import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type Product = {
  id: string;
  name: string;
  price: number;
  description: string;
  category: string;
  stock: number;
  status: "available" | "sold";
  imageFileId?: string;
  sourceChatId?: string;
  createdAt: string;
  updatedAt: string;
};

type ProductFile = { products: Product[] };

const storagePath = path.resolve(
  process.env.PRODUCTS_FILE ?? "data/products.json",
);
let state: ProductFile | null = null;
let writeChain = Promise.resolve();

async function load() {
  if (state) return state;
  try {
    state = JSON.parse(await readFile(storagePath, "utf8")) as ProductFile;
  } catch {
    state = { products: [] };
  }
  return state;
}

function persist(next: ProductFile) {
  writeChain = writeChain
    .catch(() => undefined)
    .then(async () => {
      await mkdir(path.dirname(storagePath), { recursive: true });
      await writeFile(storagePath, JSON.stringify(next, null, 2), "utf8");
    });
  return writeChain;
}

export async function listProducts() {
  return [...(await load()).products].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
}

export async function addProduct(
  input: Omit<Product, "id" | "createdAt" | "updatedAt" | "status"> & {
    status?: Product["status"];
  },
) {
  const now = new Date().toISOString();
  const product: Product = {
    ...input,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    status: input.status ?? "available",
    createdAt: now,
    updatedAt: now,
  };
  const current = await load();
  state = { products: [product, ...current.products].slice(0, 10000) };
  await persist(state);
  return product;
}

export async function updateProduct(
  id: string,
  patch: Partial<Pick<Product, "name" | "price" | "description" | "category" | "stock" | "status">>,
) {
  const current = await load();
  const product = current.products.find((item) => item.id === id);
  if (!product) return null;
  const updated = { ...product, ...patch, updatedAt: new Date().toISOString() };
  state = {
    products: current.products.map((item) => (item.id === id ? updated : item)),
  };
  await persist(state);
  return updated;
}

export async function removeProduct(id: string) {
  const current = await load();
  const nextProducts = current.products.filter((item) => item.id !== id);
  if (nextProducts.length === current.products.length) return false;
  state = { products: nextProducts };
  await persist(state);
  return true;
}
