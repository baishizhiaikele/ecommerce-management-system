import { useEffect, useState } from "react";
import { Button, Card, Empty, InputNumber, Modal, Table, Tag, message } from "antd";
import { Link2, Share2, Users, Wallet } from "lucide-react";
import {
  affiliateSummary,
  applyAffiliateWithdrawal,
  createAffiliateLink,
  listAffiliateCommissions,
  listAffiliateLinks,
  listAffiliateWithdrawals,
  type AffiliateCommissionOut,
  type AffiliateLinkOut,
  type AffiliateSummaryOut,
  type AffiliateWithdrawalOut,
} from "../api";
import { useI18n } from "../i18n";

const WD_COLORS: Record<string, string> = {
  pending: "gold",
  approved: "green",
  rejected: "red",
};

export default function Affiliate() {
  const { t } = useI18n();
  const [sum, setSum] = useState<AffiliateSummaryOut | null>(null);
  const [links, setLinks] = useState<AffiliateLinkOut[]>([]);
  const [commissions, setCommissions] = useState<AffiliateCommissionOut[]>([]);
  const [withdrawals, setWithdrawals] = useState<AffiliateWithdrawalOut[]>([]);
  const [wdOpen, setWdOpen] = useState(false);
  const [wdAmount, setWdAmount] = useState<number | null>(null);

  const load = () => {
    affiliateSummary().then(setSum).catch(() => {});
    listAffiliateLinks().then(setLinks).catch(() => {});
    listAffiliateCommissions().then(setCommissions).catch(() => {});
    listAffiliateWithdrawals().then(setWithdrawals).catch(() => {});
  };
  useEffect(load, []);

  const shareUrl = (code: string) => `${location.origin}/?ref=${code}`;

  const genLink = async () => {
    try {
      const link = await createAffiliateLink();
      await navigator.clipboard.writeText(shareUrl(link.code)).catch(() => {});
      message.success(t("aff.linkCopied"));
      load();
    } catch {
      message.error(t("common.operationFailed"));
    }
  };

  const copy = async (code: string) => {
    await navigator.clipboard.writeText(shareUrl(code)).catch(() => {});
    message.success(t("aff.linkCopied"));
  };

  const applyWd = async () => {
    if (!wdAmount || wdAmount <= 0) return;
    try {
      await applyAffiliateWithdrawal(wdAmount);
      message.success(t("aff.wdApplied"));
      setWdOpen(false);
      setWdAmount(null);
      load();
    } catch (e: any) {
      message.error(e?.response?.data?.detail || t("common.operationFailed"));
    }
  };

  const stats = [
    { icon: <Wallet size={18} />, label: t("aff.available"), value: `¥${(sum?.available ?? 0).toFixed(2)}` },
    { icon: <Share2 size={18} />, label: t("aff.total"), value: `¥${(sum?.total_commission ?? 0).toFixed(2)}` },
    { icon: <Users size={18} />, label: t("aff.invitees"), value: String(sum?.invitees ?? 0) },
    { icon: <Link2 size={18} />, label: t("aff.clicks"), value: String(sum?.clicks ?? 0) },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{t("aff.title")}</h1>
          <p className="text-slate-400 text-sm mt-0.5">{t("aff.desc")}</p>
        </div>
        <div className="flex gap-2">
          <Button type="primary" icon={<Share2 size={14} />} onClick={genLink}>
            {t("aff.genLink")}
          </Button>
          <Button onClick={() => setWdOpen(true)} disabled={!sum || sum.available <= 0}>
            {t("aff.withdraw")}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map((s) => (
          <Card key={s.label} className="soft-card">
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              {s.icon} {s.label}
            </div>
            <div className="text-2xl font-bold mt-1">{s.value}</div>
          </Card>
        ))}
      </div>

      <Card className="soft-card" title={t("aff.myLinks")}>
        {links.length === 0 ? (
          <Empty description={t("aff.noLinks")} />
        ) : (
          <div className="space-y-2">
            {links.map((l) => (
              <div key={l.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2.5">
                <div className="min-w-0">
                  <div className="font-mono text-sm">{shareUrl(l.code)}</div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {t("aff.clickCount").replace("{n}", String(l.clicks))}
                    {l.product_id ? ` · ${t("aff.productLink")}` : ` · ${t("aff.storeLink")}`}
                  </div>
                </div>
                <Button size="small" onClick={() => copy(l.code)}>
                  {t("aff.copy")}
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="soft-card" title={t("aff.commissions")}>
        <Table
          rowKey="id"
          size="small"
          pagination={{ pageSize: 8, hideOnSinglePage: true }}
          dataSource={commissions}
          locale={{ emptyText: <Empty description={t("aff.noCommissions")} /> }}
          columns={[
            {
              title: t("aff.colTime"),
              dataIndex: "created_at",
              render: (v: string | null) => (v ? new Date(v).toLocaleString() : "-"),
            },
            {
              title: t("aff.colOrderAmount"),
              dataIndex: "order_amount",
              render: (v: number) => `¥${v.toFixed(2)}`,
            },
            {
              title: t("aff.colCommission"),
              dataIndex: "commission",
              render: (v: number) => <span className="font-semibold text-emerald-600">+¥{v.toFixed(2)}</span>,
            },
            {
              title: t("aff.colStatus"),
              dataIndex: "status",
              render: (v: string) => (
                <Tag color={v === "settled" ? "green" : "red"}>
                  {v === "settled" ? t("aff.settled") : t("aff.reversed")}
                </Tag>
              ),
            },
          ]}
        />
      </Card>

      <Card className="soft-card" title={t("aff.withdrawals")}>
        <Table
          rowKey="id"
          size="small"
          pagination={{ pageSize: 5, hideOnSinglePage: true }}
          dataSource={withdrawals}
          locale={{ emptyText: <Empty description={t("aff.noWithdrawals")} /> }}
          columns={[
            {
              title: t("aff.colTime"),
              dataIndex: "created_at",
              render: (v: string | null) => (v ? new Date(v).toLocaleString() : "-"),
            },
            {
              title: t("aff.colAmount"),
              dataIndex: "amount",
              render: (v: number) => `¥${v.toFixed(2)}`,
            },
            {
              title: t("aff.colStatus"),
              dataIndex: "status",
              render: (v: string) => <Tag color={WD_COLORS[v]}>{t(`aff.wd.${v}`)}</Tag>,
            },
            { title: t("aff.colRemark"), dataIndex: "remark", render: (v: string | null) => v || "-" },
          ]}
        />
      </Card>

      <Modal
        open={wdOpen}
        title={t("aff.withdraw")}
        onCancel={() => setWdOpen(false)}
        onOk={applyWd}
        okButtonProps={{ disabled: !wdAmount || wdAmount <= 0 }}
      >
        <div className="text-slate-500 text-sm mb-2">
          {t("aff.availableNow").replace("{n}", (sum?.available ?? 0).toFixed(2))}
        </div>
        <InputNumber
          className="w-full"
          min={0.01}
          max={sum?.available ?? 0}
          precision={2}
          value={wdAmount}
          onChange={(v) => setWdAmount(v)}
          placeholder={t("aff.amountPh")}
        />
      </Modal>
    </div>
  );
}
