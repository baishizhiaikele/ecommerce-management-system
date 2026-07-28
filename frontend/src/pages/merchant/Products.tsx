import { useEffect, useState } from "react";
import type { AxiosError } from "axios";
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  message,
  Popconfirm,
  Card,
} from "antd";
import { PlusOutlined, RobotOutlined, FileTextOutlined, DollarOutlined, AppstoreOutlined } from "@ant-design/icons";
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
import { useI18n } from "../../i18n";
import Guard from "./Guard";
import EmptyState from "../../components/EmptyState";
import VariantManager from "../../components/VariantManager";

export default function MerchantProducts() {
  const { t } = useI18n();
  const [items, setItems] = useState<ProductOut[]>([]);
  const [cats, setCats] = useState<CategoryOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<ProductOut | null>(null);
  const [modal, setModal] = useState(false);
  const [form] = Form.useForm();

  // AI 店长
  const [aiOpen, setAiOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<{ title: string; sales_copy: string; price_suggestion: number } | null>(null);

  // 营销文案
  const [mkOpen, setMkOpen] = useState(false);
  const [mkRes, setMkRes] = useState("");
  const [mkLoading, setMkLoading] = useState(false);
  const [mkTarget, setMkTarget] = useState<ProductOut | null>(null);
  const [mkPlatform, setMkPlatform] = useState<"小红书" | "朋友圈" | "抖音">("小红书");

  // 智能定价
  const [prOpen, setPrOpen] = useState(false);
  const [prRes, setPrRes] = useState<{ suggested_price: number; reason: string } | null>(null);
  const [prLoading, setPrLoading] = useState(false);
  const [prTarget, setPrTarget] = useState<ProductOut | null>(null);

  // 规格管理
  const [vmOpen, setVmOpen] = useState(false);
  const [vmProductId, setVmProductId] = useState("");
  const [vmProductName, setVmProductName] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [p, c] = await Promise.all([myProducts(), listCategories()]);
      setItems(p);
      setCats(c);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const openEdit = (r?: ProductOut) => {
    setEdit(r || null);
    form.resetFields();
    if (r) form.setFieldsValue(r);
    setModal(true);
  };
  const submit = async () => {
    const v = await form.validateFields();
    try {
      if (edit) await updateProduct(edit.id, v);
      else await createProduct({ ...v, status: "pending" });
      message.success(edit ? t("common.updated") : t("mprod.createdDraft"));
      setModal(false);
      load();
    } catch (e) {
      const err = e as AxiosError<any, any>;
      message.error(err.response?.data?.detail || t("mprod.saveFail"));
    }
  };
  const remove = async (id: string) => {
    try {
      await deleteProduct(id);
      message.success(t("common.deleted"));
      load();
    } catch (e) {
      const err = e as AxiosError<any, any>;
      message.error(err.response?.data?.detail || t("mprod.deleteFail"));
    }
  };

  const openAi = (r: ProductOut) => {
    setEdit(r);
    setAiResult(null);
    setAiOpen(true);
  };
  const runAi = async () => {
    if (!edit) return;
    setAiLoading(true);
    try {
      const r = await aiGenerateProduct(edit.id);
      setAiResult(r);
      message.success(t("mprod.genOk"));
    } catch {
      message.error(t("mprod.genFail"));
    } finally {
      setAiLoading(false);
    }
  };
  const applyAiPrice = () => {
    if (!aiResult) return;
    form.setFieldsValue({ price: aiResult.price_suggestion });
    setAiOpen(false);
    message.success(t("mprod.applied"));
  };

  const openMk = (r: ProductOut) => {
    setEdit(r);
    setMkTarget(r);
    setMkRes("");
    setMkOpen(true);
  };
  const runMk = async () => {
    if (!mkTarget) return;
    setMkLoading(true);
    try {
      const r = await aiMarketing(mkTarget.id, mkPlatform);
      setMkRes(r.content);
      message.success(t("mprod.genOk"));
    } catch {
      message.error(t("mprod.genFail"));
    } finally {
      setMkLoading(false);
    }
  };

  const openPr = (r: ProductOut) => {
    setEdit(r);
    setPrTarget(r);
    setPrRes(null);
    setPrOpen(true);
  };
  const runPr = async () => {
    if (!prTarget) return;
    setPrLoading(true);
    try {
      const r = await aiPriceAdvice(prTarget.id);
      setPrRes(r);
      message.success(t("mprod.priceOk"));
    } catch {
      message.error(t("mprod.genFail"));
    } finally {
      setPrLoading(false);
    }
  };
  const applyPr = () => {
    if (!prRes) return;
    form.setFieldsValue({ price: prRes.suggested_price });
    setPrOpen(false);
    message.success(t("mprod.applied"));
  };

  return (
    <Guard>
      <Card
        title={t("mprod.myTitle")}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openEdit()}>
            {t("mprod.create")}
          </Button>
        }
      >
        {!loading && items.length === 0 ? (
          <EmptyState
            title={t("mprod.emptyTitle")}
            description={t("mprod.emptyDesc")}
            action={
              <Button type="primary" icon={<PlusOutlined />} onClick={() => openEdit()}>
                {t("mprod.create")}
              </Button>
            }
          />
        ) : (
          <Table
            rowKey="id"
            dataSource={items}
            loading={loading}
            columns={[
              { title: t("col.name"), dataIndex: "name" },
              {
                title: t("col.price"),
                dataIndex: "price",
                render: (v) => `¥${Number(v).toFixed(2)}`,
              },
              { title: t("col.stock"), dataIndex: "stock" },
              {
                title: t("common.status"),
                dataIndex: "status",
                render: (s: string) => (s === "active" ? t("common.online") : t("common.offline")),
              },
              {
                title: t("col.aiPrice"),
                dataIndex: "ai_price_suggestion",
                render: (v) => (v ? `¥${Number(v).toFixed(2)}` : "—"),
              },
              {
                title: t("common.action"),
                render: (_, r) => (
                  <div className="flex flex-wrap gap-1">
                    <Button size="small" onClick={() => openEdit(r)}>
                      {t("common.edit")}
                    </Button>
                    <Button size="small" icon={<RobotOutlined />} onClick={() => openAi(r)}>
                      {t("mprod.aiManager")}
                    </Button>
                    <Button size="small" icon={<FileTextOutlined />} onClick={() => openMk(r)}>
                      {t("mprod.marketing")}
                    </Button>
                    <Button size="small" icon={<DollarOutlined />} onClick={() => openPr(r)}>
                      {t("mprod.smartPrice")}
                    </Button>
                    <Button
                      size="small"
                      icon={<AppstoreOutlined />}
                      onClick={() => {
                        setVmProductId(r.id);
                        setVmProductName(r.name);
                        setVmOpen(true);
                      }}
                    >
                      {t("mprod.specManage")}
                    </Button>
                    <Popconfirm title={t("common.confirmDelete")} onConfirm={() => remove(r.id)}>
                      <Button size="small" danger>
                        {t("common.delete")}
                      </Button>
                    </Popconfirm>
                  </div>
                ),
              },
            ]}
          />
        )}
      </Card>

      <Modal
        title={edit ? t("mprod.edit") : t("mprod.create")}
        open={modal}
        onOk={submit}
        onCancel={() => setModal(false)}
        okText={t("common.save")}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label={t("mprod.name")} rules={[{ required: true, message: t("mprod.reqName") }]}>
            <Input />
          </Form.Item>
          <Form.Item name="price" label={t("col.price")} rules={[{ required: true, message: t("mprod.reqPrice") }]}>
            <InputNumber min={0} step={0.01} className="w-full" />
          </Form.Item>
          <Form.Item name="stock" label={t("col.stock")} rules={[{ required: true, message: t("mprod.reqStock") }]}>
            <InputNumber min={0} className="w-full" />
          </Form.Item>
          <Form.Item name="description" label={t("mprod.desc")}>
            <Input.TextArea rows={3} placeholder={t("common.optional")} />
          </Form.Item>
          <Form.Item name="image_url" label={t("mprod.imageUrl")}>
            <Input placeholder={t("common.optional")} />
          </Form.Item>
          <Form.Item name="category_id" label={t("mprod.category")}>
            <Select
              allowClear
              placeholder={t("common.optional")}
              options={cats.map((c) => ({ value: c.id, label: c.name }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* AI 店长 */}
      <Modal
        title={t("mprod.aiResult")}
        open={aiOpen}
        onCancel={() => setAiOpen(false)}
        footer={[
          <Button key="close" onClick={() => setAiOpen(false)}>
            {t("common.close")}
          </Button>,
          <Button key="apply" type="primary" disabled={!aiResult} onClick={applyAiPrice}>
            {t("mprod.applyPrice")}
          </Button>,
        ]}
      >
        <Button block loading={aiLoading} onClick={runAi} style={{ marginBottom: 12 }}>
          {t("mprod.gen")}
        </Button>
        {aiResult && (
          <div className="space-y-2">
            <div>
              <b>{t("mprod.aiTitle")}</b>
              {aiResult.title}
            </div>
            <div>
              <b>{t("mprod.aiCopy")}</b>
              {aiResult.sales_copy}
            </div>
            <div>
              <b>{t("mprod.aiPrice")}</b>¥{aiResult.price_suggestion}
            </div>
          </div>
        )}
      </Modal>

      {/* 营销文案 */}
      <Modal
        title={t("mprod.aiMarketing")}
        open={mkOpen}
        onCancel={() => setMkOpen(false)}
        footer={[
          <Button key="close" onClick={() => setMkOpen(false)}>
            {t("common.close")}
          </Button>,
        ]}
      >
        <div className="mb-2">
          <label className="block text-sm text-slate-500 mb-1">{t("mprod.platform")}</label>
          <Select
            value={mkPlatform}
            onChange={(v) => setMkPlatform(v)}
            className="w-full"
            options={[
              { value: "小红书", label: "小红书" },
              { value: "朋友圈", label: "朋友圈" },
              { value: "抖音", label: "抖音" },
            ]}
          />
        </div>
        <Button block loading={mkLoading} onClick={runMk} style={{ marginBottom: 12 }}>
          {t("mprod.gen")}
        </Button>
        {mkRes && <div className="p-3 bg-slate-50 rounded whitespace-pre-wrap">{mkRes}</div>}
      </Modal>

      {/* 智能定价 */}
      <Modal
        title={t("mprod.aiPricing")}
        open={prOpen}
        onCancel={() => setPrOpen(false)}
        footer={[
          <Button key="close" onClick={() => setPrOpen(false)}>
            {t("common.close")}
          </Button>,
          <Button key="apply" type="primary" disabled={!prRes} onClick={applyPr}>
            {t("mprod.apply")}
          </Button>,
        ]}
      >
        <Button block loading={prLoading} onClick={runPr} style={{ marginBottom: 12 }}>
          {t("mprod.analyze")}
        </Button>
        {prRes && (
          <div>
            <div>
              <b>{t("mprod.aiPrice")}</b>¥{prRes.suggested_price}
            </div>
            <div className="text-slate-400 text-xs mt-1">{prRes.reason}</div>
          </div>
        )}
        <div className="text-slate-400 text-xs mt-2">{t("mprod.aiPriceHint")}</div>
      </Modal>

      <VariantManager
        productId={vmProductId}
        productName={vmProductName}
        open={vmOpen}
        onClose={() => setVmOpen(false)}
      />
    </Guard>
  );
}
