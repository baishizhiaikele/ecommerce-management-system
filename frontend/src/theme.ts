import type { ThemeConfig } from "antd";
import { theme as antdTheme } from "antd";

// 简约风 · 中性灰阶梯 + 单一克制品牌色（不渐变）
export const brand = {
  primary: "#4F46E5", // 克制靛蓝，唯一强调色
  primaryStrong: "#4338CA",
  primarySoft: "#EEF0FF",
  ink: "#111827", // 近黑墨色
  inkSoft: "#374151",
  muted: "#6B7280", // 次级灰
  faint: "#9CA3AF", // 弱灰
  line: "#EEF0F3", // 细边框
  surface: "#FFFFFF", // 卡片/表面
  bg: "#F7F8FA", // 布局底色
};

export const theme: ThemeConfig = {
  cssVar: true,
  token: {
    colorPrimary: brand.primary,
    colorInfo: brand.primary,
    colorLink: brand.primary,
    colorLinkHover: brand.primaryStrong,
    colorTextBase: brand.ink,
    colorText: brand.ink,
    colorTextSecondary: brand.muted,
    colorBorder: brand.line,
    colorBorderSecondary: brand.line,
    colorBgLayout: brand.bg,
    colorBgContainer: brand.surface,
    colorBgElevated: brand.surface,
    borderRadius: 12,
    borderRadiusLG: 16,
    fontFamily: "PingFang SC, system-ui, -apple-system, sans-serif",
    fontSize: 14,
    wireframe: false,
    controlHeight: 40,
    colorPrimaryBg: "rgba(79,70,229,0.08)",
    colorPrimaryBgHover: "rgba(79,70,229,0.12)",
  },
  components: {
    Button: {
      primaryShadow: "0 1px 2px rgba(79,70,229,0.18)",
      fontWeight: 500,
      controlHeight: 38,
      borderRadius: 8,
    },
    Card: {
      borderRadiusLG: 12,
    },
    Layout: {
      headerBg: "#FFFFFF",
      headerHeight: 64,
      siderBg: "#FFFFFF",
      bodyBg: brand.bg,
    },
    Menu: {
      itemSelectedBg: "rgba(79,70,229,0.08)",
      itemSelectedColor: brand.primary,
      itemHoverBg: "rgba(17,24,39,0.04)",
      itemHeight: 44,
      itemMarginInline: 8,
      itemBorderRadius: 8,
      itemMarginBlock: 4,
    },
    Table: {
      headerBg: "#FAFAFB",
      headerColor: "#6B7280",
      headerSplitColor: "transparent",
      rowHoverBg: "rgba(79,70,229,0.03)",
      borderColor: brand.line,
    },
    Segmented: {
      itemSelectedBg: "#FFFFFF",
      trackBg: "rgba(17,24,39,0.04)",
    },
    Tabs: {
      inkBarColor: brand.primary,
      itemSelectedColor: brand.primary,
      itemActiveColor: brand.primary,
    },
    Statistic: {
      contentFontSize: 28,
    },
    Tag: {
      borderRadiusSM: 6,
    },
    Tooltip: {
      colorBgSpotlight: "rgba(17,23,39,0.92)",
    },
    Drawer: {
      borderRadiusLG: 14,
    },
    Modal: {
      borderRadiusLG: 14,
    },
  },
};

// 深色模式：复用浅色 token 结构，仅重映射颜色为暗色调，保持品牌色一致。
export const darkTheme: ThemeConfig = {
  ...theme,
  algorithm: antdTheme.darkAlgorithm,
  token: {
    ...theme.token,
    colorTextBase: "#E5E7EB",
    colorText: "#E5E7EB",
    colorTextSecondary: "#9CA3AF",
    colorBorder: "#2A2F3A",
    colorBorderSecondary: "#2A2F3A",
    colorBgLayout: "#0F1115",
    colorBgContainer: "#171A21",
    colorBgElevated: "#1E222B",
  },
  components: {
    ...theme.components,
    Layout: {
      headerBg: "#171A21",
      headerHeight: 64,
      siderBg: "#171A21",
      bodyBg: "#0F1115",
    },
    Menu: {
      itemSelectedBg: "rgba(99,91,255,0.16)",
      itemSelectedColor: "#A5B4FC",
      itemHoverBg: "rgba(255,255,255,0.06)",
      itemHeight: 44,
      itemMarginInline: 8,
      itemBorderRadius: 8,
      itemMarginBlock: 4,
    },
    Table: {
      headerBg: "#1B1F27",
      headerColor: "#9CA3AF",
      headerSplitColor: "transparent",
      rowHoverBg: "rgba(99,91,255,0.08)",
      borderColor: "#2A2F3A",
    },
    Segmented: {
      itemSelectedBg: "#2A2F3A",
      trackBg: "rgba(255,255,255,0.06)",
    },
    Tooltip: {
      colorBgSpotlight: "rgba(0,0,0,0.85)",
    },
  },
};
