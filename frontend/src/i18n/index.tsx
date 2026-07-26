import { createContext, useContext, useState, ReactNode } from "react";

type Lang = "zh" | "en";

const dict: Record<Lang, Record<string, string>> = {
  zh: {
    market: "商品集市",
    shops: "逛店铺",
    favorites: "收藏",
    points: "积分",
    cart: "购物车",
    orders: "我的订单",
    notifications: "通知中心",
    coupons: "我的卡券",
    support: "客服工单",
    login: "登录",
    logout: "退出登录",
    profile: "个人中心",
    brand: "AI 全托管小店",
    promotions: "促销活动",
    following: "我的关注",
    searchPlaceholder: "搜索商品 / 店铺",
    hotSearch: "热门搜索：",
    searchHistory: "搜索历史：",
    clear: "清空",
    addToCart: "加入购物车",
    buyNow: "立即购买",
    askAI: "咨询 AI",
    reviews: "评价",
    inventory: "库存管理",
    lowStock: "低库存",
    createActivity: "创建活动",
    myProducts: "商品管理",
  },
  en: {
    market: "Market",
    shops: "Shops",
    favorites: "Favorites",
    points: "Points",
    cart: "Cart",
    orders: "My Orders",
    notifications: "Notifications",
    coupons: "Coupons",
    support: "Support",
    login: "Login",
    logout: "Logout",
    profile: "Profile",
    brand: "AI Smart Shop",
    promotions: "Promotions",
    following: "Following",
    searchPlaceholder: "Search products / shops",
    hotSearch: "Hot:",
    searchHistory: "History:",
    clear: "Clear",
    addToCart: "Add to Cart",
    buyNow: "Buy Now",
    askAI: "Ask AI",
    reviews: "Reviews",
    inventory: "Inventory",
    lowStock: "Low Stock",
    createActivity: "Create",
    myProducts: "Products",
  },
};

interface I18nCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
}

const Ctx = createContext<I18nCtx>({
  lang: "zh",
  setLang: () => {},
  t: (k) => k,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(
    () => ((localStorage.getItem("lang") as Lang) || "zh")
  );
  const setLang = (l: Lang) => {
    localStorage.setItem("lang", l);
    setLangState(l);
  };
  const t = (key: string) => dict[lang][key] ?? key;
  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
