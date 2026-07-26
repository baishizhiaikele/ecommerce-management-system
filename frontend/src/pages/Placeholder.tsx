import { ThunderboltOutlined } from "@ant-design/icons";

export default function Placeholder({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-indigo-50 p-6">
      <div className="text-center max-w-md">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[#6366F1] to-[#22D3EE] text-white text-2xl mb-6 shadow-lg">
          <ThunderboltOutlined />
        </div>
        <h1 className="text-3xl font-bold text-slate-800 mb-2">{title}</h1>
        <p className="text-slate-500 leading-relaxed">{desc}</p>
        <div className="mt-8 text-sm text-slate-400">脚手架已就绪，功能模块将在后续步骤构建。</div>
      </div>
    </div>
  );
}
