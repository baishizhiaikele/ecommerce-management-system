import { useEffect } from "react";
import { Modal } from "antd";
import { useNavigate } from "react-router-dom";
import { useI18n } from "../i18n";

interface LoginPromptProps {
  open: boolean;
  onClose: () => void;
  /** 触发登录的原因，影响文案与登录后回跳：cart=加购成功，checkout=去结算 */
  reason?: "cart" | "checkout";
}

/**
 * 游客加购/结算时的非阻断式登录引导。
 * 区别于 ProtectedRoute 的强制跳转：此处用户可关闭浮层继续浏览，购物车已暂存到本地，
 * 登录后自动合并（见 store/cart.ts 的 mergeGuestToServer）。对标天猫/京东的「先逛再加购」体验。
 */
export default function LoginPrompt({ open, onClose, reason = "cart" }: LoginPromptProps) {
  const { t } = useI18n();
  const navigate = useNavigate();

  // 关闭时锁定背景滚动，避免浮层后页面跟着滚动
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const goLogin = () => {
    const from =
      reason === "checkout"
        ? "/cart"
        : window.location.pathname + window.location.search;
    onClose();
    navigate("/login", { state: { from } });
  };

  const titleId = "login-prompt-title";
  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      centered
      width={400}
      destroyOnClose
      aria-labelledby={titleId}
    >
      <div className="text-center pt-2 pb-4">
        <div className="text-2xl mb-3">🛒</div>
        <h3 id={titleId} className="text-lg font-semibold text-slate-800 mb-1">
          {reason === "checkout" ? t("loginPrompt.checkoutTitle") : t("loginPrompt.cartTitle")}
        </h3>
        <p className="text-sm text-slate-500 mb-5 leading-relaxed">
          {reason === "checkout"
            ? t("loginPrompt.checkoutDesc")
            : t("loginPrompt.cartDesc")}
        </p>
        <button
          onClick={goLogin}
          className="w-full h-10 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition"
        >
          {t("loginPrompt.login")}
        </button>
        <button
          onClick={onClose}
          className="w-full h-10 mt-2 rounded-lg text-slate-500 hover:text-slate-700 text-sm transition"
        >
          {t("loginPrompt.continueBrowse")}
        </button>
      </div>
    </Modal>
  );
}
