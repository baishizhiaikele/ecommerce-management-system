import { useEffect, useState } from "react";
import { Button, Card, Empty, Form, Input, List, message, Popconfirm, Tag } from "antd";
import { listKnowledge, createKnowledge, deleteKnowledge, KnowledgeOut } from "../../api";
import { useI18n } from "../../i18n";

export default function Knowledge() {
  const { t } = useI18n();
  const [list, setList] = useState<KnowledgeOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      setList(await listKnowledge());
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const add = async (v: { question: string; answer: string }) => {
    try {
      await createKnowledge(v.question, v.answer);
      message.success(t("kb.added"));
      form.resetFields();
      load();
    } catch (e: any) {
      message.error(e?.response?.data?.detail || t("common.operationFailed"));
    }
  };

  const del = async (id: string) => {
    try {
      await deleteKnowledge(id);
      load();
    } catch (e: any) {
      message.error(e?.response?.data?.detail || t("common.operationFailed"));
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("kb.title")}</h1>
      <p className="text-slate-500 text-sm">{t("kb.desc")}</p>

      <Card title={t("kb.addManual")} className="soft-card">
        <Form form={form} layout="vertical" onFinish={add}>
          <Form.Item name="question" label={t("kb.question")} rules={[{ required: true }]}>
            <Input maxLength={500} placeholder={t("kb.questionPh")} />
          </Form.Item>
          <Form.Item name="answer" label={t("kb.answer")} rules={[{ required: true }]}>
            <Input.TextArea rows={3} maxLength={2000} placeholder={t("kb.answerPh")} />
          </Form.Item>
          <Button type="primary" htmlType="submit">
            {t("kb.add")}
          </Button>
        </Form>
      </Card>

      <Card title={`${t("kb.entries")} (${list.length})`} className="soft-card">
        {list.length === 0 && !loading ? (
          <Empty description={t("common.noData")} />
        ) : (
          <List
            loading={loading}
            dataSource={list}
            renderItem={(e) => (
              <List.Item
                key={e.id}
                actions={[
                  <Popconfirm
                    key="del"
                    title={t("kb.confirmDelete")}
                    onConfirm={() => del(e.id)}
                  >
                    <Button type="link" danger size="small">
                      {t("common.delete")}
                    </Button>
                  </Popconfirm>,
                ]}
              >
                <List.Item.Meta
                  title={
                    <span className="flex items-center gap-2 flex-wrap">
                      {e.question}
                      <Tag color={e.source === "learned" ? "purple" : "blue"}>
                        {e.source === "learned" ? t("kb.learned") : t("kb.manual")}
                      </Tag>
                      {e.hit_count > 0 && (
                        <Tag color="green">
                          {t("kb.hits").replace("{n}", String(e.hit_count))}
                        </Tag>
                      )}
                    </span>
                  }
                  description={e.answer}
                />
              </List.Item>
            )}
          />
        )}
      </Card>
    </div>
  );
}
