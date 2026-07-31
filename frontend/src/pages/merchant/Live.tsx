import { useEffect, useState } from "react";
import {
  Button,
  Card,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Table,
  Tag,
  message,
} from "antd";
import { PlusOutlined, RobotOutlined, StarOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import {
  createLiveRoom,
  endLiveRoom,
  getLiveRoom,
  liveAiScript,
  myLiveRooms,
  myProducts,
  removeLiveProduct,
  setLiveExplaining,
  startLiveRoom,
  upsertLiveProduct,
  type LiveProductOut,
  type LiveRoomDetail,
  type LiveRoomOut,
  type ProductOut,
} from "../../api";
import { useI18n } from "../../i18n";

const STATUS_COLORS: Record<string, string> = { scheduled: "default", live: "red", ended: "default" };

export default function MerchantLive() {
  const { t } = useI18n();
  const [rooms, setRooms] = useState<LiveRoomOut[]>([]);
  const [products, setProducts] = useState<ProductOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  // 直播间挂车管理抽屉
  const [drawerRoom, setDrawerRoom] = useState<LiveRoomDetail | null>(null);
  const [script, setScript] = useState<string>("");
  const [scriptLoading, setScriptLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [rs, ps] = await Promise.all([myLiveRooms(), myProducts()]);
      setRooms(rs);
      setProducts(ps);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const submit = async () => {
    const v = await form.validateFields();
    try {
      await createLiveRoom({
        title: v.title,
        cover_url: v.cover_url || undefined,
        product_ids: v.product_ids || [],
      });
      message.success(t("live.m.created"));
      setOpen(false);
      form.resetFields();
      load();
    } catch (e: any) {
      message.error(e?.response?.data?.detail || t("common.operationFailed"));
    }
  };

  const doAction = async (room: LiveRoomOut, action: "start" | "end") => {
    try {
      if (action === "start") await startLiveRoom(room.id);
      else await endLiveRoom(room.id);
      message.success(action === "start" ? t("live.m.started") : t("live.m.ended"));
      load();
    } catch (e: any) {
      message.error(e?.response?.data?.detail || t("common.operationFailed"));
    }
  };

  const openDrawer = async (room: LiveRoomOut) => {
    const detail = await getLiveRoom(room.id);
    setDrawerRoom(detail);
    setScript("");
  };

  const onUpsert = async (p: LiveProductOut, patch: { live_price?: number | null; pinned?: boolean }) => {
    if (!drawerRoom) return;
    try {
      await upsertLiveProduct(drawerRoom.id, p.id, patch);
      message.success(t("live.m.saved"));
      openDrawer(drawerRoom);
    } catch (e: any) {
      message.error(e?.response?.data?.detail || t("common.operationFailed"));
    }
  };

  const onExplain = async (p: LiveProductOut) => {
    if (!drawerRoom) return;
    try {
      await setLiveExplaining(drawerRoom.id, p.id, !p.explaining);
      openDrawer(drawerRoom);
    } catch (e: any) {
      message.error(e?.response?.data?.detail || t("common.operationFailed"));
    }
  };

  const onRemove = async (p: LiveProductOut) => {
    if (!drawerRoom) return;
    try {
      await removeLiveProduct(drawerRoom.id, p.id);
      message.success(t("live.m.removed"));
      openDrawer(drawerRoom);
    } catch (e: any) {
      message.error(e?.response?.data?.detail || t("common.operationFailed"));
    }
  };

  const genScript = async (productId?: string) => {
    if (!drawerRoom) return;
    setScriptLoading(true);
    try {
      const r = await liveAiScript(drawerRoom.id, productId);
      setScript(r.script);
    } catch (e: any) {
      message.error(e?.response?.data?.detail || t("common.operationFailed"));
    } finally {
      setScriptLoading(false);
    }
  };

  return (
    <Card
      className="soft-card"
      title={t("live.m.title")}
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
          {t("live.m.create")}
        </Button>
      }
    >
      <Table
        rowKey="id"
        loading={loading}
        dataSource={rooms}
        pagination={false}
        locale={{ emptyText: t("live.m.empty") }}
        columns={[
          { title: t("live.m.roomTitle"), dataIndex: "title" },
          {
            title: t("common.status"),
            dataIndex: "status",
            render: (s: string) => <Tag color={STATUS_COLORS[s]}>{t(`live.status.${s}`)}</Tag>,
          },
          { title: t("live.m.viewers"), dataIndex: "viewers" },
          { title: t("live.m.products"), dataIndex: "product_count" },
          {
            title: t("live.m.createdAt"),
            dataIndex: "created_at",
            render: (v: string | null) => (v ? dayjs(v).format("MM-DD HH:mm") : "-"),
          },
          {
            title: t("common.action"),
            render: (_: unknown, r: LiveRoomOut) => (
              <div className="flex gap-2">
                <Button size="small" onClick={() => openDrawer(r)}>
                  {t("live.m.manage")}
                </Button>
                {r.status === "scheduled" && (
                  <Button size="small" type="primary" onClick={() => doAction(r, "start")}>
                    {t("live.m.start")}
                  </Button>
                )}
                {r.status === "live" && (
                  <Popconfirm title={t("live.m.confirmEnd")} onConfirm={() => doAction(r, "end")}>
                    <Button size="small" danger>
                      {t("live.m.end")}
                    </Button>
                  </Popconfirm>
                )}
              </div>
            ),
          },
        ]}
      />

      <Modal
        title={t("live.m.create")}
        open={open}
        onOk={submit}
        onCancel={() => setOpen(false)}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="title"
            label={t("live.m.roomTitle")}
            rules={[{ required: true, min: 2, message: t("live.m.reqTitle") }]}
          >
            <Input maxLength={100} placeholder={t("live.m.titlePh")} />
          </Form.Item>
          <Form.Item name="cover_url" label={t("live.m.cover")}>
            <Input placeholder="https://..." />
          </Form.Item>
          <Form.Item name="product_ids" label={t("live.m.pickProducts")}>
            <Select
              mode="multiple"
              showSearch
              optionFilterProp="label"
              placeholder={t("live.m.pickPh")}
              options={products.map((p) => ({ value: p.id, label: p.name }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title={drawerRoom ? `${t("live.m.manage")} · ${drawerRoom.title}` : t("live.m.manage")}
        width={560}
        open={!!drawerRoom}
        onClose={() => setDrawerRoom(null)}
      >
        <div className="flex items-center gap-2 mb-3">
          <Button icon={<RobotOutlined />} loading={scriptLoading} onClick={() => genScript()}>
            {t("live.m.genScript")}
          </Button>
          <span className="text-xs text-slate-400">{t("live.m.genScriptHint")}</span>
        </div>
        {script && (
          <Card size="small" className="mb-3 bg-slate-50">
            <pre className="whitespace-pre-wrap text-sm">{script}</pre>
          </Card>
        )}

        <Table
          rowKey="id"
          dataSource={drawerRoom?.products || []}
          pagination={false}
          locale={{ emptyText: t("live.m.noProducts") }}
          columns={[
            {
              title: t("live.m.product"),
              dataIndex: "name",
              render: (name: string, p: LiveProductOut) => (
                <div className="flex items-center gap-2">
                  {p.explaining && <StarOutlined className="text-amber-500" />}
                  <span>{name}</span>
                </div>
              ),
            },
            {
              title: t("live.m.price"),
              render: (_: unknown, p: LiveProductOut) => (
                <div className="flex items-center gap-1">
                  <span className="text-slate-400 line-through text-xs">¥{p.price}</span>
                  <span className="text-rose-500 font-medium">
                    ¥{p.live_price ?? p.price}
                  </span>
                </div>
              ),
            },
            {
              title: t("common.action"),
              render: (_: unknown, p: LiveProductOut) => (
                <div className="flex flex-col gap-1">
                  <Button size="small" onClick={() => onExplain(p)}>
                    {p.explaining ? t("live.m.explainingStop") : t("live.m.explaining")}
                  </Button>
                  <Popconfirm
                    title={t("live.m.setLivePrice")}
                    onConfirm={async () => {
                      const v = window.prompt(t("live.m.livePricePh"), String(p.live_price ?? p.price));
                      if (v != null) await onUpsert(p, { live_price: Number(v) || null });
                    }}
                  >
                    <Button size="small">{t("live.m.editPrice")}</Button>
                  </Popconfirm>
                  <Button size="small" onClick={() => onUpsert(p, { pinned: !p.pinned })}>
                    {p.pinned ? t("live.m.unpin") : t("live.m.pin")}
                  </Button>
                  <Button size="small" danger onClick={() => onRemove(p)}>
                    {t("live.m.remove")}
                  </Button>
                </div>
              ),
            },
          ]}
        />
      </Drawer>
    </Card>
  );
}
