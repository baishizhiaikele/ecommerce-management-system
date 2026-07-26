import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Form, Input, Segmented, message } from "antd";
import { LockOutlined, UserOutlined, ThunderboltOutlined } from "@ant-design/icons";
import { api } from "../../api/client";
import { useAuth } from "../../store/auth";
import { homeForRole } from "../../utils/roleRouting";

type Mode = "login" | "register";

export default function Login() {
  const [mode, setMode] = useState<Mode>("login");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [form] = Form.useForm();

  const onFinish = async (values: any) => {
    setLoading(true);
    try {
      const url = mode === "login" ? "/auth/login" : "/auth/register";
      const payload =
        mode === "login"
          ? { username: values.username, password: values.password }
          : { username: values.username, email: values.email, password: values.password, role: values.role || "buyer" };
      const { data } = await api.post(url, payload);
      if (mode === "login") {
        // 令牌已写入 HttpOnly Cookie（S4），直接拉取当前用户
        const me = await api.get("/auth/me");
        setUser(me.data);
        navigate(homeForRole(me.data.role));
      } else {
        message.success("注册成功，请登录");
        setMode("login");
        form.resetFields();
      }
    } catch (e: any) {
      message.error(e.response?.data?.detail || "操作失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      <div className="hidden md:flex md:w-1/2 items-center justify-center bg-gradient-to-br from-[#6366F1] via-[#818CF8] to-[#22D3EE] relative overflow-hidden">
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_30%_30%,white,transparent_40%),radial-gradient(circle_at_70%_70%,white,transparent_40%)]" />
        <div className="relative text-white px-12">
          <div className="flex items-center gap-2 text-2xl font-bold mb-4">
            <ThunderboltOutlined /> AI 全托管小店
          </div>
          <p className="text-lg leading-relaxed max-w-sm">
            不会运营？让 AI 店长替你写文案、定价格、当客服。
            从上传一张照片开始，剩下的交给人工智能。
          </p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="backdrop-blur-xl bg-white/70 border border-white/60 shadow-2xl rounded-2xl p-8">
            <h1 className="text-2xl font-bold text-slate-800 mb-1">
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
              <Button type="primary" htmlType="submit" block loading={loading} className="bg-[#6366F1]">
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
