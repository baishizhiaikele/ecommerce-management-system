import { useEffect, useState } from "react";
import type { AxiosError } from "axios";
import {
  Drawer,
  Table,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Space,
  Tag,
  message,
} from "antd";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import {
  listVariants,
  createVariant,
  updateVariant,
  deleteVariant,
  type VariantOut,
} from "../api";
import { useI18n } from "../i18n";

interface Props {
  productId: string;
  productName: string;
  open: boolean;
  onClose: () => void;
}

interface SpecRow {
  key: string;
  val: string;
}

export default function VariantManager({ productId, productName, open, onClose }: Props) {
  const { t } = useI18n();
  const [variants, setVariants] = useState<VariantOut[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<VariantOut | null>(null);
  const [form] = Form.useForm();
  const [specs, setSpecs] = useState<SpecRow[]>([{ key: "", val: "" }]);

  const load = async () => {
    setLoading(true);
    try {
      setVariants(await listVariants(productId));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (open) load();
  }, [open, productId]);

  const openCreate = () => {
    setEditing(null);
    setSpecs([{ key: "", val: "" }]);
    form.resetFields();
    form.setFieldsValue({ price_delta: 0, stock: 0 });
    setModalOpen(true);
  };

  const openEdit = (v: VariantOut) => {
    setEditing(v);
    const rows = Object.entries(v.specs || {}).map(([key, val]) => ({ key, val: String(val) }));
    setSpecs(rows.length ? rows : [{ key: "", val: "" }]);
    form.setFieldsValue({
      sku_code: v.sku_code,
      price_delta: v.price_delta,
      stock: v.stock,
      image_url: v.image_url,
    });
    setModalOpen(true);
  };

  const submit = async () => {
    const values = await form.validateFields();
    const specMap: Record<string, string> = {};
    for (const s of specs) {
      if (s.key.trim()) specMap[s.key.trim()] = s.val.trim();
    }
    const payload = {
      sku_code: values.sku_code || undefined,
      specs: specMap,
      price_delta: Number(values.price_delta || 0),
      stock: Number(values.stock || 0),
      image_url: values.image_url || undefined,
    };
    try {
      if (editing) {
        await updateVariant(editing.id, payload);
        message.success(t("variant.updated"));
      } else {
        await createVariant(productId, payload);
        message.success(t("variant.created"));
      }
      setModalOpen(false);
      load();
    } catch (e: any) {
      const err = e as AxiosError<ApiError>;
      message.error(err.response?.data?.detail || t("variant.saveFail"));
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteVariant(id);
      message.success(t("common.deleted"));
      load();
    } catch (e: any) {
      const err = e as AxiosError<ApiError>;
      message.error(err.response?.data?.detail || t("variant.deleteFail"));
    }
  };

  const columns = [
    {
      title: t("variant.spec"),
      dataIndex: "specs",
      render: (s: Record<string, string>) => (
        <Space wrap>
          {Object.entries(s || {}).map(([k, v]) => (
            <Tag key={k}>{k}: {v}</Tag>
          ))}
          {(!s || Object.keys(s).length === 0) && <span className="text-slate-400">{t("variant.default")}</span>}
        </Space>
      ),
    },
    { title: t("inv.sku"), dataIndex: "sku_code", render: (txt: string) => txt || "-" },
    {
      title: t("variant.delta"),
      dataIndex: "price_delta",
      render: (n: number) => (n > 0 ? `+¥${n}` : `¥${n}`),
    },
    { title: t("col.stock"), dataIndex: "stock" },
    {
      title: t("common.action"),
      render: (_: unknown, v: VariantOut) => (
        <Space>
          <Button size="small" onClick={() => openEdit(v)}>
            {t("common.edit")}
          </Button>
          <Popconfirm title={t("variant.confirmDel")} onConfirm={() => remove(v.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Drawer title={t("variant.title", { name: productName })} width={640} open={open} onClose={onClose}>
      <div className="mb-3 flex justify-end">
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          {t("variant.create")}
        </Button>
      </div>
      <Table
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={variants}
        pagination={false}
        size="small"
      />

      <Modal
        title={editing ? t("variant.edit") : t("variant.create")}
        open={modalOpen}
        onOk={submit}
        onCancel={() => setModalOpen(false)}
        okText={t("common.save")}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item label={t("variant.skuCode")} name="sku_code">
            <Input placeholder={t("variant.skuPlaceholder")} />
          </Form.Item>
          <Form.Item label={t("variant.items")}>
            <Space direction="vertical" className="w-full">
              {specs.map((s, i) => (
                <Space key={i}>
                  <Input
                    placeholder={t("variant.specName")}
                    value={s.key}
                    onChange={(e) =>
                      setSpecs((arr) =>
                        arr.map((x, idx) => (idx === i ? { ...x, key: e.target.value } : x))
                      )
                    }
                    style={{ width: 120 }}
                  />
                  <Input
                    placeholder={t("variant.specValue")}
                    value={s.val}
                    onChange={(e) =>
                      setSpecs((arr) =>
                        arr.map((x, idx) => (idx === i ? { ...x, val: e.target.value } : x))
                      )
                    }
                    style={{ width: 120 }}
                  />
                  <Button
                    danger
                    type="text"
                    icon={<DeleteOutlined />}
                    onClick={() => setSpecs((arr) => arr.filter((_, idx) => idx !== i))}
                  />
                </Space>
              ))}
              <Button
                type="dashed"
                onClick={() => setSpecs((arr) => [...arr, { key: "", val: "" }])}
                block
              >
                {t("variant.addItem")}
              </Button>
            </Space>
          </Form.Item>
          <Form.Item label={t("variant.delta")} name="price_delta">
            <InputNumber className="w-full" precision={2} />
          </Form.Item>
          <Form.Item label={t("col.stock")} name="stock">
            <InputNumber className="w-full" min={0} />
          </Form.Item>
          <Form.Item label={t("mprod.imageUrl")} name="image_url">
            <Input placeholder={t("common.optional")} />
          </Form.Item>
        </Form>
      </Modal>
    </Drawer>
  );
}
