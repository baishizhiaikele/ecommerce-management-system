import { useState } from "react";
import type { AxiosError } from "axios";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Button, Form, Input, Segmented, Tag, Modal, message } from "antd";
import { LockOutlined, UserOutlined, ThunderboltOutlined } from "@ant-design/icons";
import { api, getErrorMessage } from "../../api/client";
import { useAuth } from "../../store/auth";
import { useCart } from "../../store/cart";
import { homeForRole } from "../../utils/roleRouting";
import { useI18n } from "../../i18n";

type Mode = "login" | "register";

interface LoginValues {
  username?: string;
  password?: string;
  email?: string;
  role?: string;
}

// 演示账号：仅用于本地/演示环境体验，不含任何真实个人信息
const DEMO_ACCOUNTS = [
  { labelKey: "role.buyer", username: "buyer", password: "buyer123" },
  { labelKey: "role.merchant", username: "merchant", password: "merchant123" },
  { labelKey: "role.admin", username: "admin", password: "admin123" },
];

// 注册时实时展示密码强度，引导用户设置更安全的密码
function PasswordStrength({ password }: { password: string }) {
  const { t } = useI18n();
  if (!password) return null;
  const checks = [
    password.length >= 8,
    /[a-z]/.test(password) && /[A-Z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ];
  const score = checks.filter(Boolean).length;
  const colors = ["#ef4444", "#f59e0b", "#3b82f6", "#22c55e"];
  const labels = [t("auth.pwdWeak"), t("auth.pwdFair"), t("auth.pwdGood"), t("auth.pwdStrong")];
  const idx = Math.max(0, Math.min(score - 1, 3));
  return (
    <div className="mt-1">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-1 flex-1 rounded-full"
            style={{ background: i <= idx ? colors[idx] : "var(--brand-line)" }}
          />
        ))}
      </div>
      <div className="text-xs mt-1" style={{ color: colors[idx] }}>
        {t("auth.strength")}：{labels[idx]}
      </div>
    </div>
  );
}

export default function Login({ initialMode = "login" }: { initialMode?: Mode }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { setUser } = useAuth();
  const { t } = useI18n();
  const [form] = Form.useForm();

  // 被拦截跳转过来的来源页：登录成功后原路返回，别把用户丢回首页重新找一遍
  const from =
    (location.state as { from?: string } | null)?.from || searchParams.get("redirect") || null;

  const onFinish = async (values: LoginValues) => {
    setLoading(true);
    try {
      const url = mode === "login" ? "/auth/login" : "/auth/register";
      const payload =
        mode === "login"
          ? { username: values.username, password: values.password }
          : {
              username: values.username,
              email: values.email,
              password: values.password,
              role: values.role || "buyer",
            };
      await api.post(url, payload);
      if (mode === "login") {
        const me = await api.get("/auth/me");
        setUser(me.data);
        // 登录成功后把游客期间加入的本地购物车合并进服务端
        void useCart.getState().mergeGuestToServer();
        navigate(from || homeForRole(me.data.role), { replace: true });
      } else {
        message.success(t("register.success"));
        setMode("login");
        form.resetFields();
      }
    } catch (e) {
      const err = e as AxiosError<ApiError>;
      message.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // 演示环境无密码找回后端，点击后给出说明而非静默无反应
  const onForgot = () => {
    Modal.info({
      title: t("login.forgotTitle"),
      content: t("login.forgotDesc"),
      okText: t("common.ok"),
    });
  };

  return (
    <div className="min-h-screen flex bg-[#F7F8FA]">
      <div className="hidden md:flex md:w-1/2 items-center justify-center bg-white border-r border-[#EEF0F3] relative overflow-hidden">
        <div className="relative text-slate-800 px-12">
          <div className="flex items-center gap-2 text-2xl font-semibold mb-4">
            <ThunderboltOutlined /> {t("auth.brand")}
          </div>
          <p className="text-lg leading-relaxed max-w-sm text-slate-500">
            {t("auth.heroText")}
          </p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="card-soft p-8">
            <h1 className="text-2xl font-semibold text-slate-800 mb-1">
              {mode === "login" ? t("page.login.title") : t("register.title")}
            </h1>
            <p className="text-slate-500 text-sm mb-6">{t("auth.subtitle")}</p>

            <Segmented
              className="mb-6 w-full"
              block
              value={mode}
              onChange={(v) => setMode(v as Mode)}
              options={[
                { label: t("login.signIn"), value: "login" },
                { label: t("login.register"), value: "register" },
              ]}
            />

            <Form form={form} layout="vertical" onFinish={onFinish} size="large">
              <Form.Item name="username" rules={[{ required: true, message: t("auth.reqUser") }]}>
                <Input prefix={<UserOutlined />} placeholder={t("common.username")} />
              </Form.Item>
              {mode === "register" && (
                <Form.Item
                  name="email"
                  rules={[
                    { required: true, message: t("auth.reqEmail") },
                    { type: "email", message: t("auth.emailInvalid") },
                  ]}
                >
                  <Input placeholder={t("auth.email")} />
                </Form.Item>
              )}
              <Form.Item
                name="password"
                rules={[
                  { required: true, message: t("auth.reqPwd") },
                  // 与后端对齐，前置提示避免提交后才报错
                  ...(mode === "register"
                    ? [
                        { min: 8, message: t("auth.pwdTooShort") },
                        {
                          // 至少同时包含字母和数字，挡住纯数字/纯字母的弱密码
                          pattern: /^(?=.*[A-Za-z])(?=.*\d).+$/,
                          message: t("auth.pwdRule"),
                        },
                      ]
                    : []),
                ]}
              >
                <Input.Password prefix={<LockOutlined />} placeholder={t("common.password")} />
              </Form.Item>
              {mode === "register" && (
                <Form.Item noStyle shouldUpdate>
                  {({ getFieldValue }) => (
                    <PasswordStrength password={(getFieldValue("password") as string) || ""} />
                  )}
                </Form.Item>
              )}
              {mode === "register" && (
                <Form.Item
                  name="confirmPassword"
                  dependencies={["password"]}
                  rules={[
                    { required: true, message: t("auth.reqConfirmPwd") },
                    ({ getFieldValue }) => ({
                      validator(_, value) {
                        if (!value || getFieldValue("password") === value) return Promise.resolve();
                        return Promise.reject(new Error(t("auth.pwdMismatch")));
                      },
                    }),
                  ]}
                >
                  <Input.Password prefix={<LockOutlined />} placeholder={t("auth.confirmPwd")} />
                </Form.Item>
              )}
              {mode === "register" && (
                <Form.Item name="role" initialValue="buyer">
                  <Segmented
                    block
                    options={[
                      { label: t("role.buyer"), value: "buyer" },
                      { label: t("role.merchant"), value: "merchant" },
                    ]}
                  />
                </Form.Item>
              )}
              {mode === "login" && (
                <div className="flex justify-end -mt-2 mb-3">
                  <a className="text-xs text-[#4F46E5] cursor-pointer" onClick={onForgot}>
                    {t("login.forgot")}
                  </a>
                </div>
              )}
              <Button type="primary" htmlType="submit" block loading={loading}>
                {mode === "login" ? t("login.signIn") : t("auth.registerSubmit")}
              </Button>
            </Form>

            {mode === "login" && (
              <div className="mt-6 text-xs text-slate-400 leading-relaxed">
                {t("login.demoHint")}
                <div className="mt-2 flex flex-wrap gap-2">
                  {DEMO_ACCOUNTS.map((a) => (
                    <Tag.CheckableTag
                      key={a.username}
                      checked={false}
                      onChange={() => {
                        // 一键填入，省去手输演示账号；仍需用户主动点击登录
                        form.setFieldsValue({ username: a.username, password: a.password });
                      }}
                      className="!border !border-slate-200 !text-slate-500 cursor-pointer"
                    >
                      {t(a.labelKey)} · {t("login.demoFill")}
                    </Tag.CheckableTag>
                  ))}
                </div>
                <div className="mt-4 pt-4 border-t border-slate-100 text-center">
                  <a
                    className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
                    onClick={() => navigate("/console/login")}
                  >
                    {t("login.toConsole")}
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
