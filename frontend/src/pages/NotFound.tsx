import { useNavigate } from "react-router-dom";
import { Button, Result } from "antd";
import { useI18n } from "../i18n";

// C6：统一 404 页面，替代原先 path="*" 静默跳转首页，
// 让错误链接对用户可见，并提供一键返回首页的入口。
export default function NotFound() {
  const { t } = useI18n();
  const navigate = useNavigate();
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-indigo-50 p-6">
      <Result
        status="404"
        title="404"
        subTitle={t("notFound.desc")}
        extra={
          <Button type="primary" onClick={() => navigate("/")}>
            {t("notFound.home")}
          </Button>
        }
      />
    </div>
  );
}
