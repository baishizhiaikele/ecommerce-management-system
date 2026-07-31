import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, Col, Empty, Input, Modal, Row, Spin, Tabs, Tag, message } from "antd";
import { CalendarClock, Sparkles } from "lucide-react";
import {
  listPresales,
  myPresaleReservations,
  payPresaleBalance,
  payPresaleDeposit,
  type PresaleOut,
  type PresaleReservationOut,
} from "../api";
import { getErrorMessage } from "../api/client";
import { useI18n } from "../i18n";
import { formatDateTime, money } from "../utils/format";
import ProductImage from "../components/ProductImage";
import { useAuth } from "../store/auth";

export default function Presales() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [presales, setPresales] = useState<PresaleOut[]>([]);
  const [reservations, setReservations] = useState<PresaleReservationOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [balanceFor, setBalanceFor] = useState<PresaleReservationOut | null>(null);
  const [address, setAddress] = useState("");

  const load = () => {
    setLoading(true);
    Promise.all([
      listPresales().catch(() => [] as PresaleOut[]),
      user ? myPresaleReservations().catch(() => [] as PresaleReservationOut[]) : Promise.resolve([]),
    ])
      .then(([ps, rs]) => {
        setPresales(ps);
        setReservations(rs);
      })
      .catch((e) => message.error(getErrorMessage(e)))
      .finally(() => setLoading(false));
  };
  useEffect(load, [user]);

  const deposit = async (p: PresaleOut) => {
    try {
      await payPresaleDeposit(p.id);
      message.success(t("ps.depositPaid"));
      load();
    } catch (e: any) {
      message.error(e?.response?.data?.detail || t("common.operationFailed"));
    }
  };

  const payBalance = async () => {
    if (!balanceFor || address.trim().length < 5) {
      message.warning(t("ps.addressRequired"));
      return;
    }
    try {
      const r = await payPresaleBalance(balanceFor.id, address.trim());
      message.success(t("ps.balancePaid"));
      setBalanceFor(null);
      setAddress("");
      if (r.order_id) navigate(`/orders/${r.order_id}`);
      else load();
    } catch (e: any) {
      message.error(e?.response?.data?.detail || t("common.operationFailed"));
    }
  };

  const presaleTab = loading ? (
    <div className="text-center py-16">
      <Spin />
    </div>
  ) : presales.length === 0 ? (
    <Empty className="py-16" description={t("ps.empty")} />
  ) : (
    <Row gutter={[16, 16]}>
      {presales.map((p) => (
        <Col key={p.id} xs={24} sm={12} lg={8}>
          <Card hoverable className="soft-card overflow-hidden">
            <div
              className="aspect-video bg-slate-100 cursor-pointer"
              onClick={() => navigate(`/products/${p.product_id}`)}
            >
              <ProductImage src={p.product_image} alt={p.product_name || p.title} />
            </div>
            <div className="p-3 space-y-2">
              <div className="font-semibold truncate">{p.title}</div>
              <div className="text-xs text-slate-400 truncate">{p.product_name}</div>
              <div className="flex items-end gap-2">
                <span className="text-rose-600 font-bold text-lg">
                  ¥{money(p.presale_price)}
                </span>
                {p.original_price && (
                  <span className="text-slate-400 line-through text-xs">
                    ¥{money(p.original_price)}
                  </span>
                )}
              </div>
              <Tag color="magenta" icon={<Sparkles size={11} className="inline mr-0.5" />}>
                {t("ps.inflateTag")
                  .replace("{deposit}", money(p.deposit))
                  .replace("{deduction}", String(p.deposit_deduction ?? "-"))}
              </Tag>
              {p.end_at && (
                <div className="text-xs text-slate-400 flex items-center gap-1">
                  <CalendarClock size={12} />
                  {t("ps.endAt").replace("{time}", formatDateTime(p.end_at))}
                </div>
              )}
              <Button type="primary" block onClick={() => deposit(p)}>
                {t("ps.payDeposit").replace("{n}", money(p.deposit))}
              </Button>
            </div>
          </Card>
        </Col>
      ))}
    </Row>
  );

  const reservationTab =
    reservations.length === 0 ? (
      <Empty className="py-16" description={t("ps.noReservations")} />
    ) : (
      <div className="space-y-4">
        {reservations.map((r) => (
          <Card key={r.id} className="soft-card">
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 rounded-lg overflow-hidden bg-slate-100 shrink-0">
                <ProductImage src={r.product_image} alt={r.product_name || ""} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{r.presale_title}</div>
                <div className="text-xs text-slate-400 truncate">{r.product_name}</div>
                <div className="text-xs mt-1">
                  {t("ps.depositLabel")}: ¥{money(r.deposit_paid)}
                  {r.status === "deposit_paid" && r.balance_due != null && (
                    <span className="ml-2 text-rose-600 font-medium">
                      {t("ps.balanceLabel")}: ¥{r.balance_due.toFixed(2)}
                    </span>
                  )}
                </div>
              </div>
              {r.status === "deposit_paid" ? (
                <Button type="primary" onClick={() => setBalanceFor(r)}>
                  {t("ps.payBalance")}
                </Button>
              ) : r.status === "completed" ? (
                <Button onClick={() => r.order_id && navigate(`/orders/${r.order_id}`)}>
                  {t("ps.viewOrder")}
                </Button>
              ) : (
                <Tag>{t("ps.cancelled")}</Tag>
              )}
            </div>
          </Card>
        ))}
      </div>
    );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-800">{t("ps.title")}</h1>
        <p className="text-slate-400 text-sm mt-1">{t("ps.desc")}</p>
      </div>
      <Tabs
        items={[
          { key: "presales", label: t("ps.tabPresales"), children: presaleTab },
          { key: "mine", label: t("ps.tabMine"), children: reservationTab },
        ]}
      />
      <Modal
        open={!!balanceFor}
        title={t("ps.payBalance")}
        onCancel={() => setBalanceFor(null)}
        onOk={payBalance}
      >
        <div className="text-sm text-slate-500 mb-2">
          {t("ps.balanceHint").replace(
            "{n}",
            balanceFor?.balance_due != null ? balanceFor.balance_due.toFixed(2) : "-"
          )}
        </div>
        <Input.TextArea
          rows={2}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder={t("ps.addressPh")}
          maxLength={200}
        />
      </Modal>
    </div>
  );
}
