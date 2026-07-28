import { useEffect, useState } from "react";
import { Button, Card, Form, Input, Modal, Popconfirm, Select, Table, Tag, message } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import {
  createLiveRoom,
  endLiveRoom,
  myLiveRooms,
  myProducts,
  startLiveRoom,
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

  return (
    <Card
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
            render: (s: string) => (
              <Tag color={STATUS_COLORS[s]}>{t(`live.status.${s}`)}</Tag>
            ),
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
    </Card>
  );
}
