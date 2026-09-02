import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';

export type Reminder = {
  id: string;
  title: string;
  date: string;
  detail?: string;
  completed: boolean;
};

export type Debt = {
  id: string;
  person: string;
  amount: number;
  direction: 'owedToMe' | 'iOwe';
  dueDate?: string;
  note?: string;
  settled: boolean;
};

export type Customer = {
  id: string;
  name: string;
  phone?: string;
  lastContact?: string;
};

export type WatchItem = {
  id: string;
  name: string;
  price: number;
  status: 'available' | 'sold';
};

export type Note = {
  id: string;
  text: string;
  createdAt: string;
};

type Store = {
  reminders: Reminder[];
  debts: Debt[];
  customers: Customer[];
  watches: WatchItem[];
  notes: Note[];
};

type AssistantContextValue = Store & {
  hydrated: boolean;
  addReminder: (item: Omit<Reminder, 'id' | 'completed'>) => void;
  toggleReminder: (id: string) => void;
  deleteReminder: (id: string) => void;
  addDebt: (item: Omit<Debt, 'id' | 'settled'>) => void;
  toggleDebt: (id: string) => void;
  deleteDebt: (id: string) => void;
  addCustomer: (item: Omit<Customer, 'id'>) => void;
  addWatch: (item: Omit<WatchItem, 'id' | 'status'>) => void;
  toggleWatch: (id: string) => void;
  addNote: (text: string) => void;
  deleteNote: (id: string) => void;
  hydrateFromServer: (entries: Array<{ id: string; kind: string; text: string; createdAt: string; data?: { amount?: number; direction?: 'owedToMe' | 'iOwe'; title?: string; date?: string; person?: string } }>) => void;
};

const STORAGE_KEY = 'watch-sales-assistant-store';
const emptyStore: Store = { reminders: [], debts: [], customers: [], watches: [], notes: [] };
const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const AssistantContext = createContext<AssistantContextValue | null>(null);

export function AssistantProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<Store>(emptyStore);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => {
        if (value) setStore(JSON.parse(value) as Store);
      })
      .catch(() => undefined)
      .finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (hydrated) {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(store)).catch(() => undefined);
    }
  }, [hydrated, store]);

  const value = useMemo<AssistantContextValue>(
    () => ({
      ...store,
      hydrated,
      addReminder: (item) =>
        setStore((current) => ({
          ...current,
          reminders: [{ ...item, id: makeId(), completed: false }, ...current.reminders],
        })),
      toggleReminder: (id) =>
        setStore((current) => ({
          ...current,
          reminders: current.reminders.map((item) =>
            item.id === id ? { ...item, completed: !item.completed } : item,
          ),
        })),
      deleteReminder: (id) =>
        setStore((current) => ({
          ...current,
          reminders: current.reminders.filter((item) => item.id !== id),
        })),
      addDebt: (item) =>
        setStore((current) => ({
          ...current,
          debts: [{ ...item, id: makeId(), settled: false }, ...current.debts],
        })),
      toggleDebt: (id) =>
        setStore((current) => ({
          ...current,
          debts: current.debts.map((item) =>
            item.id === id ? { ...item, settled: !item.settled } : item,
          ),
        })),
      deleteDebt: (id) =>
        setStore((current) => ({
          ...current,
          debts: current.debts.filter((item) => item.id !== id),
        })),
      addCustomer: (item) =>
        setStore((current) => ({
          ...current,
          customers: [{ ...item, id: makeId(), lastContact: new Date().toISOString() }, ...current.customers],
        })),
      addWatch: (item) =>
        setStore((current) => ({
          ...current,
          watches: [{ ...item, id: makeId(), status: 'available' }, ...current.watches],
        })),
      toggleWatch: (id) =>
        setStore((current) => ({
          ...current,
          watches: current.watches.map((item) =>
            item.id === id ? { ...item, status: item.status === 'available' ? 'sold' : 'available' } : item,
          ),
        })),
      addNote: (text) =>
        setStore((current) => ({
          ...current,
          notes: [{ id: makeId(), text, createdAt: new Date().toISOString() }, ...current.notes],
        })),
      deleteNote: (id) =>
        setStore((current) => ({
          ...current,
          notes: current.notes.filter((item) => item.id !== id),
        })),
      hydrateFromServer: (entries) =>
        setStore((current) => {
          const knownIds = new Set([
            ...current.reminders.map((item) => item.id),
            ...current.debts.map((item) => item.id),
            ...current.notes.map((item) => item.id),
          ]);
          const remoteReminders = entries
            .filter((entry) => entry.kind === 'reminder' && !knownIds.has(entry.id))
            .map((entry) => ({
              id: entry.id,
              title: entry.data?.title ?? entry.text,
              date: entry.data?.date ?? entry.createdAt,
              completed: false,
            }));
          const remoteDebts = entries
            .filter((entry) => entry.kind === 'debt' && !knownIds.has(entry.id) && entry.data?.amount)
            .map((entry) => ({
              id: entry.id,
              person: entry.data?.person ?? entry.text,
              amount: entry.data?.amount ?? 0,
              direction: entry.data?.direction ?? 'owedToMe',
              settled: false,
            }));
          const remoteNotes = entries
            .filter((entry) => (entry.kind === 'note' || entry.kind === 'photo' || entry.kind === 'message') && !knownIds.has(entry.id))
            .map((entry) => ({ id: entry.id, text: entry.text, createdAt: entry.createdAt }));
          if (!remoteReminders.length && !remoteDebts.length && !remoteNotes.length) return current;
          return {
            ...current,
            reminders: [...remoteReminders, ...current.reminders],
            debts: [...remoteDebts, ...current.debts],
            notes: [...remoteNotes, ...current.notes],
          };
        }),
    }),
    [hydrated, store],
  );

  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}

export function useAssistant() {
  const value = useContext(AssistantContext);
  if (!value) throw new Error('useAssistant must be used within AssistantProvider');
  return value;
}