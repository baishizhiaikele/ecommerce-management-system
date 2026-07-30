import { useEffect, useState } from "react";
import { useI18n } from "../../i18n";
import {
  createReportTask,
  deleteReportTask,
  getReportPreview,
  listReportTasks,
  ReportTaskOut,
  ReportFrequency,
  ReportPreviewOut,
  updateReportTask,
  getErrorMessage,
} from "../../api";
import {
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
  Select,
  Spin,
  Switch,
  Table,
  Tag,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const PIE_COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#a855f7"];

export default function Reports() {
  const { t } = useI18n();
  const [preview, setPreview] = useState<ReportPreviewOut | null>(null);
  const [loading, setLoading] = useState(false);
  const [tasks, setTasks] = useState<ReportTaskOut[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const [p, ts] = await Promise.all([getReportPreview(), listReportTasks()]);
      setPreview(p);
      setTasks(ts);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const submit = async () => {
    const v = await form.validateFields();
    setSaving(true);
    try {
      await createReportTask(v as { frequency: ReportFrequency; email: string; is_active: boolean });
      message.success(t("report.taskCreated"));
      setOpen(false);
      form.resetFields();
      load();
    } catch (e: unknown) {
      message.error(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (r: ReportTaskOut, active: boolean) => {
    await updateReportTask(r.id, { is_active: active });
    load();
  };
  const remove = async (id: string) => {
    await deleteReportTask(id);
    load();
  };

  const columns: ColumnsType<ReportTaskOut> = [
    {
      title: t("report.freq"),
      dataIndex: "frequency",
      render: (f: string) => <Tag color={f === "daily" ? "blue" : "purple"}>{t(`report.${f}`)}</Tag>,
    },
    { title: t("report.email"), dataIndex: "email" },
    {
      title: t("report.lastSent"),
      dataIndex: "last_sent_at",
      render: (v?: string) => (v ? new Date(v).toLocaleString() : t("report.never")),
    },
    {
      title: t("common.status"),
      dataIndex: "is_active",
      render: (a: boolean, r) => (
        <Switch checked={a} onChange={(v) => toggle(r, v)} />
      ),
    },
    {
      title: t("common.actions"),
      render: (_, r) => (
        <Popconfirm title={t("common.confirmDelete")} onConfirm={() => remove(r.id)}>
          <Button size="small" danger>
            {t("common.delete")}
          </Button>
        </Popconfirm>
      ),
    },
  ];

  const trend = preview?.sales_trend || [];
  const cats = preview?.category_breakdown || [];
  const tops = preview?.top_products || [];

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-semibold">{t("report.title")}</h2>
          <p className="text-sm text-slate-500">{t("report.desc")}</p>
        </div>
        <Button type="primary" onClick={() => setOpen(true)}>
          {t("report.schedule")}
        </Button>
      </div>

      {loading && !preview ? (
        <div className="text-center py-20">
          <Spin />
        </div>
      ) : (
        <>
          {preview?.summary && (
            <div className="card-soft p-4 mb-6 text-sm text-slate-600">
              {preview.summary}
            </div>
          )}
          <Row gutter={16}>
            <Col xs={24} lg={12} className="mb-4">
              <Card className="soft-card" title={t("report.salesTrend")}>
                {trend.length ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={trend}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="day" />
                      <YAxis />
                      <Tooltip />
                      <Line type="monotone" dataKey="gmv" stroke="#6366f1" name={t("report.gmv")} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <Empty />
                )}
              </Card>
            </Col>
            <Col xs={24} lg={12} className="mb-4">
              <Card className="soft-card" title={t("report.byCategory")}>
                {cats.length ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie
                        data={cats}
                        dataKey="gmv"
                        nameKey="category"
                        outerRadius={90}
                        label
                      >
                        {cats.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <Empty />
                )}
              </Card>
            </Col>
            <Col xs={24} className="mb-4">
              <Card className="soft-card" title={t("report.topProducts")}>
                {tops.length ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={tops}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="sales" fill="#10b981" name={t("report.sales")} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <Empty />
                )}
              </Card>
            </Col>
          </Row>
        </>
      )}

      <Card className="soft-card" title={t("report.tasks")}>
        <Table rowKey="id" columns={columns} dataSource={tasks} />
      </Card>

      <Modal
        title={t("report.schedule")}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={submit}
        confirmLoading={saving}
      >
        <Form form={form} layout="vertical" initialValues={{ frequency: "daily", is_active: true }}>
          <Form.Item name="frequency" label={t("report.freq")} rules={[{ required: true }]}>
            <Select
              options={[
                { value: "daily", label: t("report.daily") },
                { value: "weekly", label: t("report.weekly") },
              ]}
            />
          </Form.Item>
          <Form.Item
            name="email"
            label={t("report.email")}
            rules={[{ required: true, type: "email", message: t("report.reqEmail") }]}
          >
            <Input placeholder="boss@example.com" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
