import { useEffect, useState } from "react";
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
        message.success("已更新规格");
      } else {
        await createVariant(productId, payload);
        message.success("已新增规格");
      }
      setModalOpen(false);
      load();
    } catch (e: any) {
      message.error(e?.response?.data?.detail || "保存失败");
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteVariant(id);
      message.success("已删除");
      load();
    } catch (e: any) {
      message.error(e?.response?.data?.detail || "删除失败");
    }
  };

  const columns = [
    {
      title: "规格",
      dataIndex: "specs",
      render: (s: Record<string, string>) => (
        <Space wrap>
          {Object.entries(s || {}).map(([k, v]) => (
            <Tag key={k}>{k}: {v}</Tag>
          ))}
          {(!s || Object.keys(s).length === 0) && <span className="text-slate-400">默认</span>}
        </Space>
      ),
    },
    { title: "SKU", dataIndex: "sku_code", render: (t: string) => t || "-" },
    {
      title: "差价",
      dataIndex: "price_delta",
      render: (n: number) => (n > 0 ? `+¥${n}` : `¥${n}`),
    },
    { title: "库存", dataIndex: "stock" },
    {
      title: "操作",
      render: (_: unknown, v: VariantOut) => (
        <Space>
          <Button size="small" onClick={() => openEdit(v)}>
            编辑
          </Button>
          <Popconfirm title="确认删除该规格？" onConfirm={() => remove(v.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Drawer title={`规格管理 · ${productName}`} width={640} open={open} onClose={onClose}>
      <div className="mb-3 flex justify-end">
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          新增规格
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
        title={editing ? "编辑规格" : "新增规格"}
        open={modalOpen}
        onOk={submit}
        onCancel={() => setModalOpen(false)}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item label="SKU 编码" name="sku_code">
            <Input placeholder="可选，如 RED-M" />
          </Form.Item>
          <Form.Item label="规格项（名称: 值）">
            <Space direction="vertical" className="w-full">
              {specs.map((s, i) => (
                <Space key={i}>
                  <Input
                    placeholder="规格名"
                    value={s.key}
                    onChange={(e) =>
                      setSpecs((arr) =>
                        arr.map((x, idx) => (idx === i ? { ...x, key: e.target.value } : x))
                      )
                    }
                    style={{ width: 120 }}
                  />
                  <Input
                    placeholder="规格值"
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
                添加规格项
              </Button>
            </Space>
          </Form.Item>
          <Form.Item label="价格差价" name="price_delta">
            <InputNumber className="w-full" precision={2} />
          </Form.Item>
          <Form.Item label="库存" name="stock">
            <InputNumber className="w-full" min={0} />
          </Form.Item>
          <Form.Item label="图片 URL" name="image_url">
            <Input placeholder="可选" />
          </Form.Item>
        </Form>
      </Modal>
    </Drawer>
  );
}
