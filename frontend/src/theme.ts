import type { ThemeConfig } from "antd";

// 柔和清新品牌色板
export const brand = {
  primary: "#6366F1", // 柔和靛蓝（主色）
  primarySoft: "#818CF8",
  accent: "#22D3EE", // 清新青
  bg: "#F7F8FC", // 柔和冷白背景
};

export const theme: ThemeConfig = {
  token: {
    colorPrimary: brand.primary,
    borderRadius: 12,
    fontFamily: "PingFang SC, system-ui, sans-serif",
    colorBgLayout: brand.bg,
    colorLink: brand.primary,
    colorLinkHover: brand.primarySoft,
    colorTextBase: "#1f2937",
  },
  components: {
    Button: {
      primaryShadow: "0 6px 16px rgba(99,102,241,0.25)",
      fontWeight: 500,
      controlHeight: 38,
    },
    Card: {
      borderRadiusLG: 16,
    },
    Layout: {
      headerBg: "#ffffff",
      siderBg: "#ffffff",
      headerHeight: 64,
    },
    Menu: {
      itemSelectedBg: "rgba(99,102,241,0.10)",
      itemSelectedColor: brand.primary,
      itemHoverBg: "rgba(99,102,241,0.06)",
    },
    Table: {
      headerBg: "#fafbff",
      headerColor: "#64748b",
    },
  },
};
