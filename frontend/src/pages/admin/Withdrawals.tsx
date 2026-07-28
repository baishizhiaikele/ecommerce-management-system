import { useEffect, useState } from "react";
import { Button, Card, Input, Modal, Table, Tag, message } from "antd";
import {
  adminListAffiliateWithdrawals,
  adminProcessWithdrawal,
  type AffiliateWithdrawalOut,
} from "../../api";
import { useI18n } from "../../i18n";

const COLORS: Record<string, string> = { pending: "gold", approved: "green", rejected: "red" };

export default function AdminWithdrawals() {
  const { t } = useI18n();
  const [rows, setRows] = useState<AffiliateWithdrawalOut[]>([]);
  const [loading, setLoading] = useState(false);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [remark, setRemark] = useState("");

  const load = () => {
    setLoading(true);
    adminListAffiliateWithdrawals()
      .then(setRows)
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const process = async (id: string, approve: boolean, rmk?: string) => {
    try {
      await adminProcessWithdrawal(id, approve, rmk);
      message.success(t("aff.adm.processed"));
      setRejectId(null);
      setRemark("");
      load();
    } catch (e: any) {
      message.error(e?.response?.data?.detail || t("common.operationFailed"));
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">{t("aff.adm.title")}</h1>
        <p className="text-slate-400 text-sm mt-0.5">{t("aff.adm.desc")}</p>
      </div>
      <Card className="soft-card">
        <Table
          rowKey="id"
          size="small"
          loading={loading}
          pagination={{ pageSize: 10, hideOnSinglePage: true }}
          dataSource={rows}
          columns={[
            {
              title: t("aff.colTime"),
              dataIndex: "created_at",
              render: (v: string | null) => (v ? new Date(v).toLocaleString() : "-"),
            },
            { title: t("aff.adm.user"), dataIndex: "user_id", render: (v: string) => <span className="font-mono text-xs">{v.slice(0, 8)}</span> },
            { title: t("aff.colAmount"), dataIndex: "amount", render: (v: number) => `¥${v.toFixed(2)}` },
            {
              title: t("aff.colStatus"),
              dataIndex: "status",
              render: (v: string) => <Tag color={COLORS[v]}>{t(`aff.wd.${v}`)}</Tag>,
            },
            { title: t("aff.colRemark"), dataIndex: "remark", render: (v: string | null) => v || "-" },
            {
              title: t("aff.adm.actions"),
              render: (_: unknown, row: AffiliateWithdrawalOut) =>
                row.status === "pending" ? (
                  <div className="flex gap-2">
                    <Button size="small" type="primary" onClick={() => process(row.id, true)}>
                      {t("aff.adm.approve")}
                    </Button>
                    <Button size="small" danger onClick={() => setRejectId(row.id)}>
                      {t("aff.adm.reject")}
                    </Button>
                  </div>
                ) : null,
            },
          ]}
        />
      </Card>

      <Modal
        open={!!rejectId}
        title={t("aff.adm.reject")}
        onCancel={() => setRejectId(null)}
        onOk={() => rejectId && process(rejectId, false, remark || undefined)}
      >
        <Input.TextArea
          rows={3}
          value={remark}
          onChange={(e) => setRemark(e.target.value)}
          placeholder={t("aff.adm.rejectPh")}
        />
      </Modal>
    </div>
  );
}
