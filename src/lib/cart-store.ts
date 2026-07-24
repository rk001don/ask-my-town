import { useSyncExternalStore } from "react";

export type CartItem = {
  key: string; // unique per line item
  itemName: string;
  category?: string;
  subcategory?: string;
  quantity: number;
  notes?: string;
  isFreeform: boolean;
  iconKey?: string;
  productId?: string;
  unitPrice?: number | null;
  showPrice?: boolean;
  isService?: boolean;
  attachmentPath?: string;
};

const STORAGE_KEY = "mytown.cart.v1";

type State = { items: CartItem[] };

let state: State = { items: [] };
const listeners = new Set<() => void>();

function loadFromStorage() {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.items)) state = { items: parsed.items };
  } catch {
    // ignore
  }
}

let loaded = false;
function ensureLoaded() {
  if (!loaded && typeof window !== "undefined") {
    loadFromStorage();
    loaded = true;
  }
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

function emit() {
  persist();
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  ensureLoaded();
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot(): State {
  ensureLoaded();
  return state;
}

function getServerSnapshot(): State {
  return { items: [] };
}

export function useCart() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function useCartCount() {
  const { items } = useCart();
  return items.reduce((n, i) => n + i.quantity, 0);
}

// ---- mutations ----
function catalogKey(itemName: string, subcategory?: string) {
  return `cat:${subcategory ?? ""}:${itemName.toLowerCase()}`;
}

export function addCatalogItem(item: {
  itemName: string;
  category?: string;
  subcategory?: string;
  iconKey?: string;
  productId?: string;
  unitPrice?: number | null;
  showPrice?: boolean;
  isService?: boolean;
}) {
  ensureLoaded();
  const key = item.productId
    ? `prod:${item.productId}`
    : catalogKey(item.itemName, item.subcategory);
  const existing = state.items.find((i) => i.key === key);
  if (existing) {
    existing.quantity += 1;
    state = { items: [...state.items] };
  } else {
    state = {
      items: [
        ...state.items,
        {
          key,
          itemName: item.itemName,
          category: item.category,
          subcategory: item.subcategory,
          quantity: 1,
          isFreeform: false,
          iconKey: item.iconKey,
          productId: item.productId,
          unitPrice: item.unitPrice ?? null,
          showPrice: item.showPrice ?? true,
          isService: item.isService ?? false,
        },
      ],
    };
  }
  emit();
}

export function setQuantity(key: string, quantity: number) {
  ensureLoaded();
  if (quantity <= 0) {
    state = { items: state.items.filter((i) => i.key !== key) };
  } else {
    state = {
      items: state.items.map((i) => (i.key === key ? { ...i, quantity } : i)),
    };
  }
  emit();
}

export function incrementItem(key: string) {
  const item = state.items.find((i) => i.key === key);
  if (item) setQuantity(key, item.quantity + 1);
}
export function decrementItem(key: string) {
  const item = state.items.find((i) => i.key === key);
  if (item) setQuantity(key, item.quantity - 1);
}

export function setItemNotes(key: string, notes: string) {
  ensureLoaded();
  state = {
    items: state.items.map((i) => (i.key === key ? { ...i, notes } : i)),
  };
  emit();
}

export function removeItem(key: string) {
  ensureLoaded();
  state = { items: state.items.filter((i) => i.key !== key) };
  emit();
}

export function addFreeformAsk(text: string, photoNote?: string, attachmentPath?: string) {
  ensureLoaded();
  const trimmed = text.trim();
  if (!trimmed) return;
  const key = `ask:${Date.now()}:${Math.random().toString(36).slice(2, 6)}`;
  state = {
    items: [
      ...state.items,
      {
        key,
        itemName: trimmed.slice(0, 120),
        quantity: 1,
        notes: photoNote,
        isFreeform: true,
        attachmentPath,
      },
    ],
  };
  emit();
}

export function clearCart() {
  ensureLoaded();
  state = { items: [] };
  emit();
}

export function getQuantityFor(itemName: string, subcategory?: string): number {
  ensureLoaded();
  const key = catalogKey(itemName, subcategory);
  return state.items.find((i) => i.key === key)?.quantity ?? 0;
}

export function useItemQuantity(itemName: string, subcategory?: string) {
  const { items } = useCart();
  const key = catalogKey(itemName, subcategory);
  return items.find((i) => i.key === key)?.quantity ?? 0;
}

export function itemKeyFor(itemName: string, subcategory?: string) {
  return catalogKey(itemName, subcategory);
}

export function productKeyFor(productId: string) {
  return `prod:${productId}`;
}

export function useProductQuantity(productId: string) {
  const { items } = useCart();
  const key = productKeyFor(productId);
  return items.find((i) => i.key === key)?.quantity ?? 0;
}
