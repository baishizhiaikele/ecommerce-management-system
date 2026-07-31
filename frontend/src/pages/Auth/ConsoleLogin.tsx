import { useState } from "react";
import type { AxiosError } from "axios";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Button, Form, Input, Segmented, Tag, Modal, message } from "antd";
import {
  LockOutlined,
  UserOutlined,
  ShopOutlined,
  SafetyCertificateOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { api, getErrorMessage } from "../../api/client";
import { useAuth } from "../../store/auth";
import { homeForRole } from "../../utils/roleRouting";
import { useI18n } from "../../i18n";

type ConsoleRole = "merchant" | "admin";
type Mode = "login" | "register";

interface LoginValues {
  username?: string;
  password?: string;
}

// 演示账号：仅用于本地/演示环境体验，不含任何真实个人信息
const DEMO_ACCOUNTS: Record<ConsoleRole, { labelKey: string; username: string; password: string }> = {
  merchant: { labelKey: "role.merchant", username: "merchant", password: "merchant123" },
  admin: { labelKey: "role.admin", username: "admin", password: "admin123" },
};

export default function ConsoleLogin() {
  const [mode, setMode] = useState<Mode>("login");
  const [consoleRole, setConsoleRole] = useState<ConsoleRole>("merchant");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { setUser } = useAuth();
  const { t } = useI18n();
  const [form] = Form.useForm();

  const from =
    (location.state as { from?: string } | null)?.from || searchParams.get("redirect") || null;

  const onFinish = async (values: LoginValues) => {
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", {
        username: values.username,
        password: values.password,
      });
      const me = await api.get("/auth/me");
      setUser(me.data);
      // 身份校验：后台登录页只允许商家/管理员进入，买家账号在此登录会被拒绝
      if (me.data.role !== "merchant" && me.data.role !== "admin") {
        message.error(t("console.login.roleMismatch"));
        return;
      }
      navigate(from || homeForRole(me.data.role), { replace: true });
    } catch (e) {
      const err = e as AxiosError<ApiError>;
      message.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const onForgot = () => {
    Modal.info({
      title: t("login.forgotTitle"),
      content: t("login.forgotDesc"),
      okText: t("common.ok"),
    });
  };

  const isMerchant = consoleRole === "merchant";
  const accent = isMerchant ? "#0EA5E9" : "#7C3AED";

  return (
    <div className="min-h-screen flex" style={{ background: "linear-gradient(135deg,#0F172A 0%,#1E293B 100%)" }}>
      {/* 左侧品牌/身份区（深色控制台风格） */}
      <div className="hidden md:flex md:w-1/2 flex-col justify-center px-14 text-white relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-20"
          style={{
            background:
              "radial-gradient(circle at 30% 20%, rgba(14,165,233,.5), transparent 45%), radial-gradient(circle at 70% 80%, rgba(124,58,237,.5), transparent 45%)",
          }}
        />
        <div className="relative">
          <div className="flex items-center gap-2 text-2xl font-semibold mb-4">
            <ThunderboltOutlined /> {t("auth.brand")}
          </div>
          <div
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm mb-6"
            style={{ background: "rgba(255,255,255,.1)" }}
          >
            {isMerchant ? <ShopOutlined /> : <SafetyCertificateOutlined />}
            {t(isMerchant ? "console.login.merchantEntry" : "console.login.adminEntry")}
          </div>
          <p className="text-lg leading-relaxed max-w-sm text-slate-300">
            {t(isMerchant ? "console.login.merchantHero" : "console.login.adminHero")}
          </p>
        </div>
      </div>

      {/* 右侧表单 */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="rounded-2xl bg-white/95 backdrop-blur p-8 shadow-2xl">
            <h1 className="text-2xl font-semibold text-slate-800 mb-1">
              {mode === "login" ? t("console.login.title") : t("register.title")}
            </h1>
            <p className="text-slate-500 text-sm mb-6">{t("console.login.subtitle")}</p>

            <Segmented
              className="mb-6 w-full"
              block
              value={consoleRole}
              onChange={(v) => {
                setConsoleRole(v as ConsoleRole);
                form.resetFields();
              }}
              options={[
                { label: t("role.merchant"), value: "merchant", icon: <ShopOutlined /> },
                { label: t("role.admin"), value: "admin", icon: <SafetyCertificateOutlined /> },
              ]}
            />

            <Form form={form} layout="vertical" onFinish={onFinish} size="large">
              <Form.Item name="username" rules={[{ required: true, message: t("auth.reqUser") }]}>
                <Input prefix={<UserOutlined />} placeholder={t("common.username")} />
              </Form.Item>
              <Form.Item name="password" rules={[{ required: true, message: t("auth.reqPwd") }]}>
                <Input.Password prefix={<LockOutlined />} placeholder={t("common.password")} />
              </Form.Item>
              <div className="flex justify-end -mt-2 mb-3">
                <a className="text-xs cursor-pointer" style={{ color: accent }} onClick={onForgot}>
                  {t("login.forgot")}
                </a>
              </div>
              <Button
                type="primary"
                htmlType="submit"
                block
                loading={loading}
                style={{ background: accent, borderColor: accent }}
              >
                {t("console.login.signIn")}
              </Button>
            </Form>

            {/* 演示账号一键填入 */}
            <div className="mt-6 text-xs text-slate-400 leading-relaxed">
              {t("login.demoHint")}
              <div className="mt-2">
                <Tag.CheckableTag
                  checked={false}
                  onChange={() =>
                    form.setFieldsValue({
                      username: DEMO_ACCOUNTS[consoleRole].username,
                      password: DEMO_ACCOUNTS[consoleRole].password,
                    })
                  }
                  style={{ border: "1px solid #E2E8F0", color: "#64748B", cursor: "pointer" }}
                >
                  {t(DEMO_ACCOUNTS[consoleRole].labelKey)} · {t("login.demoFill")}
                </Tag.CheckableTag>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 text-center">
              <a
                className="text-xs text-slate-400 hover:text-slate-600"
                onClick={() => navigate("/login")}
              >
                {t("console.login.toBuyer")}
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
