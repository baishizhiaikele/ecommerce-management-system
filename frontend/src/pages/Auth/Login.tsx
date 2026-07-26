import { useState } from "react";
import type { AxiosError } from "axios";
import { useNavigate } from "react-router-dom";
import { Button, Form, Input, Segmented, message } from "antd";
import { LockOutlined, UserOutlined, ThunderboltOutlined } from "@ant-design/icons";
import { api, getErrorMessage } from "../../api/client";
import { useAuth } from "../../store/auth";
import { homeForRole } from "../../utils/roleRouting";

type Mode = "login" | "register";

interface LoginValues {
  username?: string;
  password?: string;
  email?: string;
  role?: string;
}

export default function Login() {
  const [mode, setMode] = useState<Mode>("login");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [form] = Form.useForm();

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
      const { data } = await api.post(url, payload);
      if (mode === "login") {
        const me = await api.get("/auth/me");
        setUser(me.data);
        navigate(homeForRole(me.data.role));
      } else {
        message.success("注册成功，请登录");
        setMode("login");
        form.resetFields();
      }
    } catch (e) {
      const err = e as AxiosError<any, any>;
      message.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-[#F7F8FA]">
      <div className="hidden md:flex md:w-1/2 items-center justify-center bg-white border-r border-[#EEF0F3] relative overflow-hidden">
        <div className="relative text-slate-800 px-12">
          <div className="flex items-center gap-2 text-2xl font-semibold mb-4">
            <ThunderboltOutlined /> AI 全托管小店
          </div>
          <p className="text-lg leading-relaxed max-w-sm text-slate-500">
            不会运营？让 AI 店长替你写文案、定价格、当客服。
            从上传一张照片开始，剩下的交给人工智能。
          </p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="bg-white border border-[#EEF0F3] shadow-sm rounded-2xl p-8">
            <h1 className="text-2xl font-semibold text-slate-800 mb-1">
              {mode === "login" ? "欢迎回来" : "创建账号"}
            </h1>
            <p className="text-slate-500 text-sm mb-6">AI 智能商店 · 全栈电商管理平台</p>

            <Segmented
              className="mb-6 w-full"
              block
              value={mode}
              onChange={(v) => setMode(v as Mode)}
              options={[
                { label: "登录", value: "login" },
                { label: "注册", value: "register" },
              ]}
            />

            <Form form={form} layout="vertical" onFinish={onFinish} size="large">
              <Form.Item name="username" rules={[{ required: true, message: "请输入用户名" }]}>
                <Input prefix={<UserOutlined />} placeholder="用户名" />
              </Form.Item>
              {mode === "register" && (
                <Form.Item
                  name="email"
                  rules={[
                    { required: true, message: "请输入邮箱" },
                    { type: "email", message: "邮箱格式不正确" },
                  ]}
                >
                  <Input placeholder="邮箱" />
                </Form.Item>
              )}
              <Form.Item name="password" rules={[{ required: true, message: "请输入密码" }]}>
                <Input.Password prefix={<LockOutlined />} placeholder="密码" />
              </Form.Item>
              {mode === "register" && (
                <Form.Item name="role" initialValue="buyer">
                  <Segmented
                    block
                    options={[
                      { label: "买家", value: "buyer" },
                      { label: "商家", value: "merchant" },
                    ]}
                  />
                </Form.Item>
              )}
              <Button type="primary" htmlType="submit" block loading={loading}>
                {mode === "login" ? "登录" : "注册并登录"}
              </Button>
            </Form>

            <div className="mt-6 text-xs text-slate-400 leading-relaxed">
              演示账号（无真实个人信息）：<br />
              买家 buyer / buyer123 ｜ 商家 merchant / merchant123 ｜ 管理员 admin / admin123
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
