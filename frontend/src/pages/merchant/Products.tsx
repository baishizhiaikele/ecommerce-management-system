import { useEffect, useState } from "react";
import type { AxiosError } from "axios";
import {
  Table,
  Button,
  Tag,
  message,
  Modal,
  Form,
  InputNumber,
  Input,
  Select,
  Popconfirm,
  Spin,
  Card,
} from "antd";
import EmptyState from "../../components/EmptyState";
import VariantManager from "../../components/VariantManager";
import { PlusOutlined, RobotOutlined } from "@ant-design/icons";
import {
  myProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  aiGenerateProduct,
  aiMarketing,
  aiPriceAdvice,
  listCategories,
  ProductOut,
  CategoryOut,
} from "../../api";
import { money, productStatusMeta } from "../../utils/format";

export default function MerchantProducts() {
  const [items, setItems] = useState<ProductOut[]>([]);
  const [cats, setCats] = useState<CategoryOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ProductOut | null>(null);
  const [form] = Form.useForm();
  const [aiOpen, setAiOpen] = useState(false);
  const [aiResult, setAiResult] = useState<{
    title: string;
    sales_copy: string;
    price_suggestion: number;
  } | null>(null);
  const [aiTarget, setAiTarget] = useState<string>("");
  const [variantTarget, setVariantTarget] = useState<ProductOut | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setItems(await myProducts());
    } catch {
      /* 忽略 */
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
    listCategories().then(setCats).catch(() => {});
  }, []);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  };
  const openEdit = (p: ProductOut) => {
    setEditing(p);
    form.setFieldsValue({
      name: p.name,
      price: Number(p.price),
      stock: p.stock,
      description: p.description,
      image_url: p.image_url,
      category_id: p.category_id,
    });
    setModalOpen(true);
  };

  const submit = async () => {
    const v = await form.validateFields();
    try {
      if (editing) {
        await updateProduct(editing.id, v);
        message.success("已更新");
      } else {
        await createProduct(v);
        message.success("已创建（草稿，待管理员审核上架）");
      }
      setModalOpen(false);
      load();
    } catch (e) {
      const err = e as AxiosError<any, any>;
      message.error(err.response?.data?.detail || "保存失败");
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteProduct(id);
      message.success("已删除");
      load();
    } catch (e) {
      const err = e as AxiosError<any, any>;
      message.error(err.response?.data?.detail || "删除失败");
    }
  };

  const runAI = async (id: string) => {
    try {
      const r = await aiGenerateProduct(id);
      setAiResult(r);
      setAiTarget(id);
      setAiOpen(true);
    } catch (e) {
      const err = e as AxiosError<any, any>;
      message.error(err.response?.data?.detail || "生成失败");
    }
  };
  const applyPrice = async () => {
    try {
      await updateProduct(aiTarget, { price: aiResult!.price_suggestion });
      message.success("已应用建议价");
      setAiOpen(false);
      load();
    } catch (e) {
      const err = e as AxiosError<any, any>;
      message.error(err.response?.data?.detail || "应用失败");
    }
  };

  // ---- AI 营销文案 ----
  const [mkOpen, setMkOpen] = useState(false);
  const [mkCopy, setMkCopy] = useState("");
  const [mkPlatform, setMkPlatform] = useState("小红书");
  const [mkLoading, setMkLoading] = useState(false);
  const [mkTarget, setMkTarget] = useState("");
  const runMarketing = (id: string) => {
    setMkTarget(id);
    setMkCopy("");
    setMkOpen(true);
  };
  const genMarketing = async () => {
    setMkLoading(true);
    try {
      const r = await aiMarketing(mkTarget, mkPlatform);
      setMkCopy(r.content);
    } catch (e) {
      const err = e as AxiosError<any, any>;
      message.error(err.response?.data?.detail || "生成失败");
    } finally {
      setMkLoading(false);
    }
  };

  // ---- AI 智能定价 ----
  const [prOpen, setPrOpen] = useState(false);
  const [prResult, setPrResult] = useState<{ suggested_price: number; reason: string } | null>(null);
  const [prLoading, setPrLoading] = useState(false);
  const [prTarget, setPrTarget] = useState("");
  const runPrice = (id: string) => {
    setPrTarget(id);
    setPrResult(null);
    setPrOpen(true);
  };
  const genPrice = async () => {
    setPrLoading(true);
    try {
      const r = await aiPriceAdvice(prTarget);
      setPrResult(r);
    } catch (e) {
      const err = e as AxiosError<any, any>;
      message.error(err.response?.data?.detail || "生成失败");
    } finally {
      setPrLoading(false);
    }
  };
  const applyPriceAdvice = async () => {
    try {
      await updateProduct(prTarget, { price: prResult!.suggested_price });
      message.success("已应用建议价");
      setPrOpen(false);
      load();
    } catch (e) {
      const err = e as AxiosError<any, any>;
      message.error(err.response?.data?.detail || "应用失败");
    }
  };

  if (loading) return <div className="text-center py-20"><Spin /></div>;

  return (
    <Card
      title="我的商品"
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          新建商品
        </Button>
      }
    >
      {items.length === 0 ? (
        <EmptyState
          title="还没有商品"
          description="点击右上角「新建商品」开始上架你的第一个商品"
        />
      ) : (
        <Table
          rowKey="id"
          dataSource={items}
          pagination={false}
          columns={[
            { title: "名称", dataIndex: "name" },
            { title: "价格", dataIndex: "price", render: (v) => `¥${money(v)}` },
            { title: "库存", dataIndex: "stock" },
            {
              title: "状态",
              dataIndex: "status",
              render: (s) => <Tag color={productStatusMeta[s].color}>{productStatusMeta[s].label}</Tag>,
            },
            {
              title: "AI 建议价",
              dataIndex: "ai_price_suggestion",
              render: (v) => (v != null ? `¥${money(v)}` : "-"),
            },
            {
              title: "操作",
              render: (_, r) => (
                <span className="flex gap-1">
                  <Button type="link" onClick={() => openEdit(r)}>
                    编辑
                  </Button>
                  <Button type="link" icon={<RobotOutlined />} onClick={() => runAI(r.id)}>
                    AI 店长
                  </Button>
                  <Button type="link" onClick={() => runMarketing(r.id)}>
                    营销文案
                  </Button>
                  <Button type="link" onClick={() => runPrice(r.id)}>
                    智能定价
                  </Button>
                  <Button type="link" onClick={() => setVariantTarget(r)}>
                    规格管理
                  </Button>
                  <Popconfirm title="确认删除？" onConfirm={() => remove(r.id)}>
                    <Button type="link" danger>
                      删除
                    </Button>
                  </Popconfirm>
                </span>
              ),
            },
          ]}
        />
      )}

      <Modal
        title={editing ? "编辑商品" : "新建商品"}
        open={modalOpen}
        onOk={submit}
        onCancel={() => setModalOpen(false)}
        okText="保存"
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="商品名称" rules={[{ required: true, message: "请输入名称" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="price" label="价格" rules={[{ required: true, message: "请输入价格" }]}>
            <InputNumber min={0.01} step={0.01} className="w-full" />
          </Form.Item>
          <Form.Item name="stock" label="库存" rules={[{ required: true, message: "请输入库存" }]}>
            <InputNumber min={0} className="w-full" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="image_url" label="图片链接">
            <Input placeholder="可选" />
          </Form.Item>
          <Form.Item name="category_id" label="分类">
            <Select
              allowClear
              placeholder="可选"
              options={cats.map((c) => ({ value: c.id, label: c.name }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="AI 店长生成结果"
        open={aiOpen}
        onCancel={() => setAiOpen(false)}
        footer={[
          <Button key="close" onClick={() => setAiOpen(false)}>
            关闭
          </Button>,
          <Button key="apply" type="primary" onClick={applyPrice}>
            应用建议价
          </Button>,
        ]}
      >
        {aiResult && (
          <div className="space-y-3">
            <div>
              <b>AI 标题：</b>
              {aiResult.title}
            </div>
            <div>
              <b>AI 文案：</b>
              <div className="text-slate-600 whitespace-pre-wrap">{aiResult.sales_copy}</div>
            </div>
            <div>
              <b>建议价：</b>¥{money(aiResult.price_suggestion)}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        title="AI 营销文案"
        open={mkOpen}
        onCancel={() => setMkOpen(false)}
        footer={[
          <Button key="gen" type="primary" loading={mkLoading} onClick={genMarketing}>
            一键生成
          </Button>,
          <Button key="close" onClick={() => setMkOpen(false)}>
            关闭
          </Button>,
        ]}
      >
        <div className="space-y-3">
          <div>
            <span className="text-slate-500 mr-2">投放平台</span>
            <Select
              value={mkPlatform}
              style={{ width: 160 }}
              onChange={setMkPlatform}
              options={[
                { value: "小红书", label: "小红书" },
                { value: "朋友圈", label: "朋友圈" },
                { value: "抖音", label: "抖音" },
              ]}
            />
          </div>
          {mkCopy && (
            <div className="bg-slate-50 rounded-lg p-3 whitespace-pre-wrap text-slate-700">
              {mkCopy}
            </div>
          )}
        </div>
      </Modal>

      <Modal
        title="AI 智能定价"
        open={prOpen}
        onCancel={() => setPrOpen(false)}
        footer={[
          <Button key="gen" type="primary" loading={prLoading} onClick={genPrice}>
            分析建议价
          </Button>,
          <Button key="apply" type="primary" disabled={!prResult} onClick={applyPriceAdvice}>
            应用
          </Button>,
        ]}
      >
        {prResult ? (
          <div className="space-y-2">
            <div className="text-2xl font-bold text-[#4F46E5]">¥{money(prResult.suggested_price)}</div>
            <div className="text-slate-600">{prResult.reason}</div>
          </div>
        ) : (
          <div className="text-slate-400">点击「分析建议价」获取 AI 定价建议</div>
        )}
      </Modal>

      <VariantManager
        productId={variantTarget?.id || ""}
        productName={variantTarget?.name || ""}
        open={!!variantTarget}
        onClose={() => setVariantTarget(null)}
      />
    </Card>
  );
}
