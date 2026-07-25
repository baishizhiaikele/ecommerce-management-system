import { create } from "zustand";

export interface CartLine {
  product_id: string;
  name: string;
  price: number;
  quantity: number;
  image_url?: string;
}

interface CartState {
  lines: CartLine[];
  add: (line: CartLine) => void;
  setQuantity: (product_id: string, quantity: number) => void;
  remove: (product_id: string) => void;
  clear: () => void;
}

export const useCart = create<CartState>((set) => ({
  lines: [],
  add: (line) =>
    set((state) => {
      const found = state.lines.find((l) => l.product_id === line.product_id);
      if (found) {
        return {
          lines: state.lines.map((l) =>
            l.product_id === line.product_id ? { ...l, quantity: l.quantity + line.quantity } : l
          ),
        };
      }
      return { lines: [...state.lines, line] };
    }),
  setQuantity: (product_id, quantity) =>
    set((state) => ({
      lines: state.lines.map((l) => (l.product_id === product_id ? { ...l, quantity } : l)),
    })),
  remove: (product_id) =>
    set((state) => ({ lines: state.lines.filter((l) => l.product_id !== product_id) })),
  clear: () => set({ lines: [] }),
}));
