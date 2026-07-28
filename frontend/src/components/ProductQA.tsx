import { useEffect, useState } from "react";
import { Button, Input, List, Tag, message, Popconfirm, Empty } from "antd";
import { CheckCircleOutlined, MessageOutlined } from "@ant-design/icons";
import {
  listQuestions,
  askQuestion,
  answerQuestion,
  acceptAnswer,
  deleteQuestion,
  type QuestionOut,
  type AnswerOut,
} from "../api";
import { useAuth } from "../store/auth";
import { useI18n } from "../i18n";

export default function ProductQA({ productId }: { productId: string }) {
  const { t } = useI18n();
  const user = useAuth((s) => s.user);
  const [list, setList] = useState<QuestionOut[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [answering, setAnswering] = useState<string | null>(null);
  const [answerContent, setAnswerContent] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      setList(await listQuestions(productId));
    } catch {
      message.error(t("common.loadFailed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  const ask = async () => {
    if (!user) {
      message.warning(t("common.loginFirst"));
      return;
    }
    if (!q.trim()) return;
    try {
      await askQuestion(productId, q.trim());
      setQ("");
      await load();
    } catch (e: any) {
      message.error(e?.response?.data?.detail || t("qna.askFail"));
    }
  };

  const answer = async (questionId: string) => {
    if (!user) {
      message.warning(t("common.loginFirst"));
      return;
    }
    if (!answerContent.trim()) return;
    try {
      await answerQuestion(questionId, answerContent.trim());
      setAnswerContent("");
      setAnswering(null);
      await load();
    } catch (e: any) {
      message.error(e?.response?.data?.detail || t("qna.answerFail"));
    }
  };

  const accept = async (questionId: string, answerId: string) => {
    try {
      await acceptAnswer(questionId, answerId);
      await load();
    } catch (e: any) {
      message.error(e?.response?.data?.detail || t("qna.acceptFail"));
    }
  };

  const del = async (questionId: string) => {
    try {
      await deleteQuestion(questionId);
      await load();
    } catch (e: any) {
      message.error(e?.response?.data?.detail || t("qna.deleteFail"));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input.TextArea
          rows={2}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("qna.askPlaceholder")}
          disabled={!user}
        />
        <Button type="primary" onClick={ask} disabled={!user || !q.trim()}>
          {t("qna.ask")}
        </Button>
      </div>

      {list.length === 0 && !loading && <Empty description={t("qna.empty")} />}

      <List
        loading={loading}
        dataSource={list}
        renderItem={(item: QuestionOut) => (
          <List.Item key={item.id} className="flex-col items-start">
            <div className="font-medium text-slate-800">
              <MessageOutlined className="mr-1 text-[#4F46E5]" />
              {item.content}
              {user && item.user_id === user.id && (
                <Popconfirm title={t("qna.confirmDelete")} onConfirm={() => del(item.id)}>
                  <Button type="link" size="small" danger className="ml-2">
                    {t("common.delete")}
                  </Button>
                </Popconfirm>
              )}
            </div>
            <div className="mt-2 w-full space-y-2 pl-6">
              {item.answers.map((a: AnswerOut) => (
                <div key={a.id} className="rounded-lg bg-slate-50 px-3 py-2">
                  <span className="text-slate-500">
                    {a.username || t("qna.anonymous")}：
                  </span>
                  <span className="text-slate-700">{a.content}</span>
                  {a.is_accepted && (
                    <Tag color="green" className="ml-2">
                      <CheckCircleOutlined /> {t("qna.accepted")}
                    </Tag>
                  )}
                  {user && item.user_id === user.id && !a.is_accepted && (
                    <Button
                      type="link"
                      size="small"
                      className="ml-2"
                      onClick={() => accept(item.id, a.id)}
                    >
                      {t("qna.accept")}
                    </Button>
                  )}
                </div>
              ))}
              {answering === item.id ? (
                <div className="flex flex-wrap gap-2">
                  <Input
                    size="small"
                    value={answerContent}
                    onChange={(e) => setAnswerContent(e.target.value)}
                    placeholder={t("qna.answerPlaceholder")}
                  />
                  <Button size="small" type="primary" onClick={() => answer(item.id)}>
                    {t("qna.submit")}
                  </Button>
                  <Button
                    size="small"
                    onClick={() => {
                      setAnswering(null);
                      setAnswerContent("");
                    }}
                  >
                    {t("common.cancel")}
                  </Button>
                </div>
              ) : (
                <Button size="small" type="link" onClick={() => setAnswering(item.id)}>
                  {t("qna.answer")}
                </Button>
              )}
            </div>
          </List.Item>
        )}
      />
    </div>
  );
}
