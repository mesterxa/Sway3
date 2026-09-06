import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type Order = {
  id: string;
  customer: string;
  product: string;
  amount: number;
  cost: number;
  status: "pending" | "paid" | "cancelled";
  note?: string;
  chatId: string;
  createdAt: string;
};

export type Expense = {
  id: string;
  title: string;
  amount: number;
  category: string;
  note?: string;
  chatId: string;
  createdAt: string;
};

export type CashMovement = {
  id: string;
  kind: "in" | "out";
  title: string;
  amount: number;
  note?: string;
  chatId: string;
  createdAt: string;
};

export type Customer = {
  id: string;
  name: string;
  phone?: string;
  note?: string;
  chatId: string;
  createdAt: string;
  updatedAt: string;
};

type EconomyFile = {
  orders: Order[];
  expenses: Expense[];
  cash: CashMovement[];
  customers: Customer[];
};

const storagePath = path.resolve(
  process.env.ECONOMY_FILE ?? "data/economy.json",
);
let state: EconomyFile | null = null;
let writeChain = Promise.resolve();

async function load() {
  if (state) return state;
  try {
    state = JSON.parse(await readFile(storagePath, "utf8")) as EconomyFile;
  } catch {
    state = { orders: [], expenses: [], cash: [], customers: [] };
  }
  return state;
}

function persist(next: EconomyFile) {
  writeChain = writeChain
    .catch(() => undefined)
    .then(async () => {
      await mkdir(path.dirname(storagePath), { recursive: true });
      await writeFile(storagePath, JSON.stringify(next, null, 2), "utf8");
    });
  return writeChain;
}

const makeId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export async function addOrder(input: Omit<Order, "id" | "createdAt">) {
  const current = await load();
  const order: Order = { ...input, id: makeId("ord"), createdAt: new Date().toISOString() };
  state = { ...current, orders: [order, ...current.orders].slice(0, 20000) };
  await persist(state);
  return order;
}

export async function addExpense(input: Omit<Expense, "id" | "createdAt">) {
  const current = await load();
  const expense: Expense = { ...input, id: makeId("exp"), createdAt: new Date().toISOString() };
  state = { ...current, expenses: [expense, ...current.expenses].slice(0, 20000) };
  await persist(state);
  return expense;
}

export async function addCashMovement(input: Omit<CashMovement, "id" | "createdAt">) {
  const current = await load();
  const movement: CashMovement = { ...input, id: makeId("cash"), createdAt: new Date().toISOString() };
  state = { ...current, cash: [movement, ...current.cash].slice(0, 20000) };
  await persist(state);
  return movement;
}

export async function upsertCustomer(input: Omit<Customer, "id" | "createdAt" | "updatedAt">) {
  const current = await load();
  const existing = current.customers.find(
    (customer) =>
      customer.chatId === input.chatId &&
      customer.name.toLocaleLowerCase() === input.name.toLocaleLowerCase(),
  );
  if (existing) {
    const updated = { ...existing, ...input, updatedAt: new Date().toISOString() };
    state = {
      ...current,
      customers: current.customers.map((item) => (item.id === existing.id ? updated : item)),
    };
    await persist(state);
    return updated;
  }
  const customer: Customer = {
    ...input,
    id: makeId("cus"),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  state = { ...current, customers: [customer, ...current.customers].slice(0, 20000) };
  await persist(state);
  return customer;
}

function sameDay(value: string, from: Date) {
  const date = new Date(value);
  return date.toDateString() === from.toDateString();
}

export async function getEconomyReport(scope: "today" | "month" | "all" = "today") {
  const current = await load();
  const now = new Date();
  const matches = (value: string) => {
    if (scope === "all") return true;
    const date = new Date(value);
    return scope === "today"
      ? sameDay(value, now)
      : date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  };
  const orders = current.orders.filter((item) => matches(item.createdAt) && item.status !== "cancelled");
  const expenses = current.expenses.filter((item) => matches(item.createdAt));
  const cash = current.cash.filter((item) => matches(item.createdAt));
  const sales = orders.reduce((sum, item) => sum + item.amount, 0);
  const cost = orders.reduce((sum, item) => sum + item.cost, 0);
  const expenseTotal = expenses.reduce((sum, item) => sum + item.amount, 0);
  const cashIn = cash.filter((item) => item.kind === "in").reduce((sum, item) => sum + item.amount, 0);
  const cashOut = cash.filter((item) => item.kind === "out").reduce((sum, item) => sum + item.amount, 0);
  return {
    scope,
    orders,
    expenses,
    sales,
    cost,
    grossProfit: sales - cost,
    expenseTotal,
    netProfit: sales - cost - expenseTotal,
    cashIn,
    cashOut,
    cashBalance: cashIn - cashOut,
  };
}

export async function getRecentEconomy(limit = 10) {
  const current = await load();
  return {
    orders: current.orders.slice(0, limit),
    expenses: current.expenses.slice(0, limit),
    cash: current.cash.slice(0, limit),
    customers: current.customers.slice(0, limit),
  };
}
