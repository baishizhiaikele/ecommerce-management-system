import { ThunderboltOutlined } from "@ant-design/icons";
import { getLang } from "../i18n";

export default function Placeholder({ title, desc }: { title: string; desc: string }) {
  const zh = getLang() === "zh";
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-indigo-50 p-6">
      <div className="text-center max-w-md">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#4F46E5] text-white text-2xl mb-6 shadow-sm">
          <ThunderboltOutlined />
        </div>
        <h1 className="text-3xl font-bold text-slate-800 mb-2">{title}</h1>
        <p className="text-slate-500 leading-relaxed">{desc}</p>
        <div className="mt-8 text-sm text-slate-400">
          {zh ? "脚手架已就绪，功能模块将在后续步骤构建。" : "Scaffold ready. Modules coming soon."}
        </div>
      </div>
    </div>
  );
}
