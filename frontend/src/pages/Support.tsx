import { useEffect, useRef, useState } from "react";
import { swallow } from "../utils/reportError";
import type { ReactNode } from "react";
import type { AxiosError } from "axios";
import {
  Badge,
  Button,
  Checkbox,
  Divider,
  Drawer,
  Dropdown,
  Form,
  Empty,
  Image,
  Input,
  List,
  Modal,
  Pagination,
  Popconfirm,
  Rate,
  Segmented,
  Select,
  Space,
  Spin,
  Tag,
  Upload,
  Result,
  message,
} from "antd";
import type { UploadFile } from "antd";
import { RobotOutlined, UploadOutlined, DeleteOutlined, ThunderboltOutlined, ReloadOutlined } from "@ant-design/icons";
import {
  aiReplyTicket,
  createTicket,
  getTicket,
  listOrders,
  listTickets,
  rateTicket,
  replyTicket,
  revokeMessage,
  closeTicket,
  deleteTicket,
  deleteTickets,
  supportUnread,
  uploadImage,
  uploadVideo,
  type OrderOut,
  type SupportMessageOut,
  type SupportTicketOut,
  type TicketCategory,
  type TicketPriority,
} from "../api";
import { useAuth } from "../store/auth";
import { useI18n } from "../i18n";
import { getErrorMessage } from "../api/client";
import { parseTime } from "../utils/format";

interface ApiError {
  detail?: string;
}

const STATUS: Record<string, { color: string; label: string }> = {
  open: { color: "orange", label: "support.status.open" },
  answered: { color: "blue", label: "support.status.answered" },
  closed: { color: "default", label: "support.status.closed" },
};
const PRIORITY_COLOR: Record<string, string> = {
  low: "default",
  normal: "blue",
  high: "orange",
  urgent: "red",
};
const CATEGORY_COLOR: Record<string, string> = {
  inquiry: "cyan",
  aftersale: "volcano",
  logistics: "geekblue",
  other: "default",
};

function isImage(url: string): boolean {
  return /\.(jpg|jpeg|png|gif|webp|bmp)(\?.*)?$/i.test(url);
}

function isVideo(url: string): boolean {
  return /\.(mp4|webm|mov|avi|mkv|ogg)(\?.*)?$/i.test(url);
}

// 撤回窗口：发送后 2 分钟内可撤回
const REVOKE_WINDOW_MS = 2 * 60 * 1000;

function canRecall(m: SupportMessageOut, role: "buyer" | "merchant" | "ai"): boolean {
  if (m.is_revoked) return false;
  if (m.sender_role !== role) return false;
  const created = parseTime(m.created_at)?.getTime();
  if (!created) return false;
  return Date.now() - created <= REVOKE_WINDOW_MS;
}

function AttachmentList({ urls, topMargin = true }: { urls: string[]; topMargin?: boolean }) {
  const { t } = useI18n();
  if (!urls || urls.length === 0) return null;
  return (
    <Space wrap size={6} style={{ marginTop: topMargin ? 6 : 0 }}>
      {urls.map((u, i) =>
        isImage(u) ? (
          <Image
            key={i}
            src={u}
            width={72}
            height={72}
            style={{ objectFit: "cover", borderRadius: 6, border: "1px solid #eee" }}
            preview={{ mask: t("support.preview") }}
          />
        ) : isVideo(u) ? (
          <video
            key={i}
            src={u}
            controls
            title={t("support.videoFullscreenHint")}
            onClick={(e) => {
              const el = e.currentTarget;
              if (document.fullscreenElement) {
                document.exitFullscreen?.();
              } else {
                el.requestFullscreen?.().catch((e) => swallow(e, "Support.fullscreen"));
              }
            }}
            style={{
              width: 140,
              maxHeight: 140,
              borderRadius: 6,
              border: "1px solid #eee",
              background: "#000",
              cursor: "pointer",
            }}
          />
        ) : (
          <a key={i} href={u} target="_blank" rel="noreferrer">
            {u.split("/").pop()}
          </a>
        )
      )}
    </Space>
  );
}

/** 附件上传器：维护 url 列表并同步给父组件 */
function AttachmentUploader({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const { t } = useI18n();
  const [items, setItems] = useState<UploadFile[]>(() =>
    (value || []).map((url, i) => ({
      uid: `init-${i}`,
      name: url.split("/").pop() || "file",
      status: "done",
      url,
    }))
  );

  const sync = (updater: UploadFile[] | ((prev: UploadFile[]) => UploadFile[])) => {
    // 用函数式更新，避免批量选择多文件时闭包里的 items 过期导致部分文件丢失
    setItems((prev) => {
      const next = typeof updater === "function" ? (updater as (p: UploadFile[]) => UploadFile[])(prev) : updater;
      onChange(
        next
          .filter((f) => f.status === "done")
          .map((f) => (f.response as { url?: string })?.url ?? f.url)
          .filter(Boolean) as string[]
      );
      return next;
    });
  };

  // 父组件清空附件（如发送成功后）时，同步清空本地预览列表
  useEffect(() => {
    if (!value || value.length === 0) setItems([]);
  }, [value]);

  const appendFile = (file: UploadFile) => {
    sync((prev) => [...prev, file]);
  };

  return (
    <Upload
      multiple
      listType="picture"
      accept="image/*,video/*"
      fileList={items}
      beforeUpload={(file) => {
        const ok = file.type.startsWith("image/") || file.type.startsWith("video/");
        if (!ok) {
          message.error(t("support.onlyMedia"));
          return Upload.LIST_IGNORE;
        }
        return true;
      }}
      customRequest={async (options) => {
        const file = options.file as File;
        const isVideoFile = file.type.startsWith("video/");
        try {
          const res = isVideoFile ? await uploadVideo(file) : await uploadImage(file);
          options.onSuccess?.(res);
          appendFile({
            uid: `${Date.now()}-${Math.random()}`,
            name: file.name,
            status: "done",
            url: res.url,
            response: res,
          } as UploadFile);
        } catch (err) {
          options.onError?.(err as Error);
          message.error(`${t("support.uploadFail")}：${getErrorMessage(err)}`);
        }
      }}
      onRemove={(f) => sync((prev) => prev.filter((x) => x.uid !== f.uid))}
    >
      <Button icon={<UploadOutlined />}>{t("support.addAttachment")}</Button>
    </Upload>
  );
}

export default function Support() {
  const { t } = useI18n();
  const role = useAuth((s) => s.user?.role);
  const [tickets, setTickets] = useState<SupportTicketOut[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(8);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [statusF, setStatusF] = useState<string>("all");
  const [priorityF, setPriorityF] = useState<string>("all");
  const [categoryF, setCategoryF] = useState<string>("all");
  const [search, setSearch] = useState("");

  const [active, setActive] = useState<SupportTicketOut | null>(null);
  const [reply, setReply] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [replyAttach, setReplyAttach] = useState<string[]>([]);
  const [aiDrafting, setAiDrafting] = useState(false);

  const [newOpen, setNewOpen] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [newMsg, setNewMsg] = useState("");
  const [newPriority, setNewPriority] = useState<TicketPriority>("normal");
  const [newCategory, setNewCategory] = useState<TicketCategory>("inquiry");
  const [newOrderId, setNewOrderId] = useState<string | undefined>();
  const [newAttach, setNewAttach] = useState<string[]>([]);
  const [orders, setOrders] = useState<OrderOut[]>([]);
  const [globalUnread, setGlobalUnread] = useState(0);

  const unreadOf = (t: SupportTicketOut) =>
    role === "merchant" ? t.unread_for_merchant : t.unread_for_buyer;

  const load = async () => {
    setLoadError(false);
    setLoading(true);
    try {
      const res = await listTickets({
        status: statusF,
        priority: priorityF,
        category: categoryF,
        search: search || undefined,
        page,
        page_size: pageSize,
      });
      setTickets(res.items);
      setTotal(res.total);
    } catch (e) {
      setLoadError(true);
      message.error(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const refreshUnread = async () => {
    try {
      const r = await supportUnread();
      setGlobalUnread(r.unread);
    } catch {
      /* 忽略 */
    }
  };

  useEffect(() => {
    load();
    refreshUnread();
  }, [statusF, priorityF, categoryF, search, page]);

  const openTicket = async (id: string) => {
    try {
      const t = await getTicket(id); // 同时服务端标记已读
      setActive(t);
      setReply("");
      setIsInternal(false);
      setReplyAttach([]);
      load();
      refreshUnread();
    } catch (e) {
      const err = e as AxiosError<ApiError>;
      message.error(err.response?.data?.detail || t("support.openFail"));
    }
  };

  const onReply = async () => {
    if (!active) return;
    if (!reply.trim() && replyAttach.length === 0) {
      message.warning(t("support.replyEmpty"));
      return;
    }
    try {
      const t = await replyTicket(active.id, {
        content: reply,
        is_internal: isInternal,
        attachments: replyAttach,
      });
      setActive(t);
      setReply("");
      setReplyAttach([]);
      setIsInternal(false);
      load();
    } catch (e) {
      const err = e as AxiosError<ApiError>;
      const status = err.response?.status;
      const detail = err.response?.data?.detail;
      message.error(
        `${t("support.replyFail")}${status ? `（${status}）` : ""}：${typeof detail === "string" ? detail : getErrorMessage(err)}`
      );
    }
  };

  // 撤回消息（发送者本人，2 分钟内）
  const onRevoke = async (messageId: string) => {
    if (!active) return;
    try {
      const t = await revokeMessage(active.id, messageId);
      setActive(t);
    } catch (err) {
      message.error(`${t("support.recallFail")}：${getErrorMessage(err)}`);
    }
  };

  const onClose = async () => {
    if (!active) return;
    try {
      const tk = await closeTicket(active.id);
      setActive(tk);
      load();
      message.success(t("support.closedMsg"));
    } catch (e) {
      const err = e as AxiosError<ApiError>;
      const status = err.response?.status;
      const detail = err.response?.data?.detail;
      message.error(
        `${t("support.replyFail")}${status ? `（${status}）` : ""}：${typeof detail === "string" ? detail : getErrorMessage(err)}`
      );
    }
  };

  const onDelete = async (id: string) => {
    try {
      await deleteTicket(id);
      message.success(t("common.deleted"));
      if (active?.id === id) setActive(null);
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      load();
      refreshUnread();
    } catch (e) {
      const err = e as AxiosError<ApiError>;
      const status = err.response?.status;
      const detail = err.response?.data?.detail;
      message.error(
        `${t("common.deleteFail")}${status ? `（${status}）` : ""}：${typeof detail === "string" ? detail : getErrorMessage(err)}`
      );
    }
  };

  const toggleSelect = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const onBatchDelete = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    try {
      await deleteTickets(ids);
      message.success(t("common.deleted"));
      setSelected(new Set());
      load();
      refreshUnread();
    } catch (e) {
      const err = e as AxiosError<ApiError>;
      const status = err.response?.status;
      const detail = err.response?.data?.detail;
      message.error(
        `${t("common.deleteFail")}${status ? `（${status}）` : ""}：${typeof detail === "string" ? detail : getErrorMessage(err)}`
      );
    }
  };

  const onAiSuggest = async () => {
    if (!active) return;
    setAiDrafting(true);
    try {
      const r = await aiReplyTicket(active.id);
      setReply(r.content);
    } catch {
      message.error(t("support.replyFail"));
    } finally {
      setAiDrafting(false);
    }
  };

  const onRate = async (rating: number, comment: string) => {
    if (!active) return;
    try {
      const tk = await rateTicket(active.id, rating, comment);
      setActive(tk);
      message.success(t("support.submitted"));
    } catch (e) {
      const err = e as AxiosError<ApiError>;
      const status = err.response?.status;
      const detail = err.response?.data?.detail;
      message.error(
        `${t("support.submitFail")}${status ? `（${status}）` : ""}：${typeof detail === "string" ? detail : getErrorMessage(err)}`
      );
    }
  };

  const openNew = async () => {
    setNewOpen(true);
    setNewSubject("");
    setNewMsg("");
    setNewPriority("normal");
    setNewCategory("inquiry");
    setNewOrderId(undefined);
    setNewAttach([]);
    try {
      setOrders(await listOrders());
    } catch {
      setOrders([]);
    }
  };

  const onCreate = async () => {
    if (!newMsg.trim()) {
      message.warning(t("support.newPlaceholder"));
      return;
    }
    try {
      const created = await createTicket({
        subject: newSubject || t("support.defaultSubject"),
        message: newMsg,
        priority: newPriority,
        category: newCategory,
        order_id: newOrderId,
        attachments: newAttach,
      });
      setNewOpen(false);
      message.success(t("support.submitted"));
      await openTicket(created.id);
      load();
    } catch (e) {
      const err = e as AxiosError<ApiError>;
      const status = err.response?.status;
      const detail = err.response?.data?.detail;
      message.error(
        `${t("support.submitFail")}${status ? `（${status}）` : ""}：${typeof detail === "string" ? detail : getErrorMessage(err)}`
      );
    }
  };

  if (role === "admin") {
    return <Empty description={t("support.adminNoNeed")} style={{ marginTop: 80 }} />;
  }

  const urgentOnly = priorityF === "urgent";

  const bottomRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [active?.messages.length]);

  const visibleMsgs =
    active && role !== "merchant"
      ? active.messages.filter((m) => !m.is_internal)
      : active?.messages || [];

  return (
    <div style={{ maxWidth: 880, margin: "0 auto", padding: "24px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>
          {role === "merchant" ? t("support.titleMerchant") : t("support.titleMine")}
          {globalUnread > 0 && (
            <Badge count={globalUnread} size="small" style={{ marginLeft: 10 }} />
          )}
        </h2>
        {role === "buyer" && (
          <Button type="primary" onClick={openNew}>
            {t("support.newTicket")}
          </Button>
        )}
      </div>

      <Space wrap style={{ marginBottom: 16 }}>
        <Segmented
          value={statusF}
          onChange={(v) => {
            setStatusF(v as string);
            setPage(1);
          }}
          options={[
            { label: t("common.all"), value: "all" },
            { label: t("support.status.open"), value: "open" },
            { label: t("support.status.answered"), value: "answered" },
            { label: t("support.status.closed"), value: "closed" },
          ]}
        />
        {role === "merchant" && (
          <Button
            icon={<ThunderboltOutlined />}
            danger={urgentOnly}
            type={urgentOnly ? "primary" : "default"}
            onClick={() => {
              setPriorityF(urgentOnly ? "all" : "urgent");
              setPage(1);
            }}
          >
            {t("support.quickUrgent")}
          </Button>
        )}
        <Select
          value={priorityF}
          style={{ width: 130 }}
          onChange={(v) => {
            setPriorityF(v);
            setPage(1);
          }}
          options={[
            { label: t("common.all"), value: "all" },
            { label: t("support.priority.low"), value: "low" },
            { label: t("support.priority.normal"), value: "normal" },
            { label: t("support.priority.high"), value: "high" },
            { label: t("support.priority.urgent"), value: "urgent" },
          ]}
        />
        <Select
          value={categoryF}
          style={{ width: 140 }}
          onChange={(v) => {
            setCategoryF(v);
            setPage(1);
          }}
          options={[
            { label: t("common.all"), value: "all" },
            { label: t("support.category.inquiry"), value: "inquiry" },
            { label: t("support.category.aftersale"), value: "aftersale" },
            { label: t("support.category.logistics"), value: "logistics" },
            { label: t("support.category.other"), value: "other" },
          ]}
        />
        <Input.Search
          allowClear
          value={search}
          placeholder={t("support.searchPlaceholder")}
          style={{ width: 220 }}
          onChange={(e) => setSearch(e.target.value)}
          onSearch={(v) => {
            setSearch(v);
            setPage(1);
          }}
        />
        <Button onClick={() => { setStatusF("all"); setPriorityF("all"); setCategoryF("all"); setSearch(""); setPage(1); }}>
          {t("support.filter.reset")}
        </Button>
      </Space>

      {role === "buyer" && tickets.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <Checkbox
            checked={selected.size > 0 && selected.size === tickets.length}
            indeterminate={selected.size > 0 && selected.size < tickets.length}
            onChange={(e) =>
              setSelected(e.target.checked ? new Set(tickets.map((x) => x.id)) : new Set())
            }
          >
            {t("support.selectAll")}
          </Checkbox>
          <Popconfirm
            title={t("support.batchDeleteConfirm")}
            okText={t("common.confirm")}
            cancelText={t("common.cancel")}
            okButtonProps={{ danger: true }}
            disabled={selected.size === 0}
            onConfirm={onBatchDelete}
          >
            <Button danger icon={<DeleteOutlined />} disabled={selected.size === 0}>
              {`${t("support.batchDelete")}（${selected.size}）`}
            </Button>
          </Popconfirm>
        </div>
      )}

      {loadError ? (
        <Result
          status="warning"
          title={t("support.loadFailed")}
          extra={
            <Button type="primary" icon={<ReloadOutlined />} onClick={load}>
              {t("common.retry")}
            </Button>
          }
        />
      ) : loading ? (
        <div style={{ textAlign: "center", padding: 40 }}>
          <Spin />
        </div>
      ) : tickets.length === 0 ? (
        <Empty description={role === "merchant" ? t("support.emptyMerchant") : t("support.emptyMine")} />
      ) : (
        <List
          bordered
          dataSource={tickets}
          renderItem={(tk) => {
            const last = tk.messages[tk.messages.length - 1];
            const unread = unreadOf(tk);
            return (
              <List.Item
                style={{ cursor: "pointer" }}
                onClick={() => openTicket(tk.id)}
                actions={[
                  <Tag color={STATUS[tk.status]?.color}>{t(STATUS[tk.status]?.label)}</Tag>,
                  <Tag color={PRIORITY_COLOR[tk.priority]}>{t(`support.priority.${tk.priority}`)}</Tag>,
                  <Tag color={CATEGORY_COLOR[tk.category]}>{t(`support.category.${tk.category}`)}</Tag>,
                  unread > 0 ? <Badge count={unread} size="small" /> : null,
                  role === "buyer" ? (
                    <Popconfirm
                      title={t("support.deleteConfirm")}
                      okText={t("common.confirm")}
                      cancelText={t("common.cancel")}
                      onConfirm={() => onDelete(tk.id)}
                      onCancel={(e) => e?.stopPropagation()}
                    >
                      <Button
                        danger
                        size="small"
                        icon={<DeleteOutlined />}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {t("common.delete")}
                      </Button>
                    </Popconfirm>
                  ) : null,
                ].filter(Boolean)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12, width: "100%" }}>
                  {role === "buyer" && (
                    <Checkbox
                      checked={selected.has(tk.id)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => toggleSelect(tk.id, e.target.checked)}
                    />
                  )}
                  <List.Item.Meta
                    style={{ flex: 1 }}
                    title={tk.subject || t("support.defaultSubject")}
                    description={
                      <span style={{ color: "var(--brand-muted)" }}>
                        {tk.product_name ? `${tk.product_name} · ` : ""}
                        {last ? last.content.slice(0, 40) : ""}
                      </span>
                    }
                  />
                </div>
              </List.Item>
            );
          }}
        />
      )}

      {total > pageSize && (
        <div style={{ textAlign: "center", marginTop: 16 }}>
          <Pagination
            current={page}
            pageSize={pageSize}
            total={total}
            onChange={(p) => setPage(p)}
            showSizeChanger={false}
          />
        </div>
      )}

      <Drawer
        title={active?.subject || t("support.detail")}
        width={560}
        open={!!active}
        onClose={() => setActive(null)}
        footer={
          active && (
            <Space direction="vertical" style={{ width: "100%" }}>
              {role === "merchant" && (
                <Space>
                  <Button onClick={() => setIsInternal((v) => !v)} type={isInternal ? "primary" : "default"}>
                    {t("support.internalNote")}
                  </Button>
                  <Button icon={<RobotOutlined />} loading={aiDrafting} onClick={onAiSuggest}>
                    {t("support.aiSuggest")}
                  </Button>
                </Space>
              )}
              <Space.Compact style={{ width: "100%" }}>
                <Input.TextArea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onPressEnter={(e) => {
                    if (!e.shiftKey) {
                      e.preventDefault();
                      onReply();
                    }
                  }}
                  placeholder={isInternal ? t("support.notePlaceholder") : t("support.replyPlaceholder")}
                  autoSize={{ minRows: 1, maxRows: 4 }}
                />
                <Button type="primary" onClick={onReply} disabled={!reply.trim() && replyAttach.length === 0}>
                  {t("support.send")}
                </Button>
              </Space.Compact>
              <AttachmentUploader value={replyAttach} onChange={setReplyAttach} />
              {isInternal && (
                <div style={{ color: "var(--brand-muted)", fontSize: 12 }}>{t("support.internalNoteHint")}</div>
              )}
              {role === "merchant" && (
                <Button danger block onClick={onClose} disabled={active.status === "closed"}>
                  {t("support.closeTicket")}
                </Button>
              )}
              {role === "buyer" && (
                <Popconfirm
                  title={t("support.deleteConfirm")}
                  okText={t("common.confirm")}
                  cancelText={t("common.cancel")}
                  okButtonProps={{ danger: true }}
                  onConfirm={() => active && onDelete(active.id)}
                >
                  <Button danger block>
                    {t("common.delete")}
                  </Button>
                </Popconfirm>
              )}
            </Space>
          )
        }
      >
        {active && (
          <>
            <Space wrap style={{ marginBottom: 8 }}>
              <Tag color={STATUS[active.status]?.color}>{t(STATUS[active.status]?.label)}</Tag>
              <Tag color={PRIORITY_COLOR[active.priority]}>{t(`support.priority.${active.priority}`)}</Tag>
              <Tag color={CATEGORY_COLOR[active.category]}>{t(`support.category.${active.category}`)}</Tag>
              {active.product_name && <Tag>{active.product_name}</Tag>}
              <Tag color="purple">
                {active.order_no ? `${t("support.relatedOrder")}：${active.order_no}` : t("support.noOrder")}
              </Tag>
            </Space>

            <Divider style={{ margin: "12px 0" }} />

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {visibleMsgs.map((m) => {
                if (m.is_revoked) {
                  return (
                    <div key={m.id} style={{ alignSelf: "center", maxWidth: "80%", color: "#999", fontSize: 12 }}>
                      {t("support.recalled")}
                    </div>
                  );
                }
                const align = m.sender_role === "buyer" ? "flex-end" : "flex-start";
                const hasAttach = m.attachments.length > 0;
                const hasText = !!m.content;
                let bubble: ReactNode;
                if (m.sender_role === "buyer") {
                  bubble = (
                    <div style={{ background: "var(--brand-surface)", padding: "8px 12px", borderRadius: 10 }}>
                      {hasAttach && <AttachmentList urls={m.attachments.map((a) => a.url)} topMargin={false} />}
                      {hasText && <div style={{ marginTop: hasAttach ? 6 : 0 }}>{m.content}</div>}
                    </div>
                  );
                } else if (m.is_internal) {
                  bubble = (
                    <>
                      <Tag color="gold">{t("support.internalNote")}</Tag>
                      <div style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-line)", padding: "8px 12px", borderRadius: 10 }}>
                        {hasAttach && <AttachmentList urls={m.attachments.map((a) => a.url)} topMargin={false} />}
                        {hasText && <div style={{ marginTop: hasAttach ? 6 : 0 }}>{m.content}</div>}
                      </div>
                    </>
                  );
                } else {
                  bubble = (
                    <>
                      {m.sender_role === "ai" && (
                        <Tag color="green" icon={<RobotOutlined />}>
                          {t("support.aiFirstAnswer")}
                        </Tag>
                      )}
                      <div
                        style={{
                          background: m.sender_role === "ai" ? "#f6ffed" : "#e6f4ff",
                          border: m.sender_role === "ai" ? "1px solid #b7eb8f" : "1px solid #91caff",
                          padding: "8px 12px",
                          borderRadius: 10,
                        }}
                      >
                        {hasAttach && <AttachmentList urls={m.attachments.map((a) => a.url)} topMargin={false} />}
                        {hasText && <div style={{ marginTop: hasAttach ? 6 : 0 }}>{m.content}</div>}
                      </div>
                    </>
                  );
                }

                const row = <div style={{ alignSelf: align, maxWidth: "80%" }}>{bubble}</div>;
                const recallable = role ? canRecall(m, role) : false;
                if (!recallable) return row;
                return (
                  <Dropdown
                    key={m.id}
                    trigger={["contextMenu"]}
                    menu={{
                      items: [{ key: "recall", label: t("support.recall") }],
                      onClick: ({ key }) => {
                        if (key === "recall") onRevoke(m.id);
                      },
                    }}
                  >
                    {row}
                  </Dropdown>
                );
              })}
            </div>

            <div ref={bottomRef} />
            {/* 买家满意度评价 */}
            {role === "buyer" && active.status !== "open" && (
              <div style={{ marginTop: 20, padding: 12, background: "#fafafa", borderRadius: 8 }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>{t("support.rateTitle")}</div>
                {active.satisfaction_rating ? (
                  <Space direction="vertical">
                    <Rate disabled value={active.satisfaction_rating} />
                    {active.satisfaction_comment && <span style={{ color: "#666" }}>{active.satisfaction_comment}</span>}
                    <Tag color="green">{t("support.rated")}</Tag>
                  </Space>
                ) : (
                  <RateForm onSubmit={onRate} placeholder={t("support.ratePlaceholder")} submitText={t("support.rateSubmit")} />
                )}
              </div>
            )}
          </>
        )}
      </Drawer>

      <Modal
        title={t("support.newTicket")}
        open={newOpen}
        onOk={onCreate}
        okText={t("common.submit")}
        cancelText={t("common.cancel")}
        onCancel={() => setNewOpen(false)}
        destroyOnHidden
      >
        <Form layout="vertical" requiredMark={false} style={{ width: "100%" }}>
          <Form.Item label={t("support.filter.category")}>
            <Select
              style={{ width: "100%" }}
              placeholder={t("support.filter.category")}
              value={newCategory}
              onChange={(v) => setNewCategory(v as TicketCategory)}
              options={[
                { label: t("support.category.inquiry"), value: "inquiry" },
                { label: t("support.category.aftersale"), value: "aftersale" },
                { label: t("support.category.logistics"), value: "logistics" },
                { label: t("support.category.other"), value: "other" },
              ]}
            />
          </Form.Item>
          <Form.Item label={t("support.filter.priority")}>
            <Select
              style={{ width: "100%" }}
              placeholder={t("support.filter.priority")}
              value={newPriority}
              onChange={(v) => setNewPriority(v as TicketPriority)}
              options={[
                { label: t("support.priority.low"), value: "low" },
                { label: t("support.priority.normal"), value: "normal" },
                { label: t("support.priority.high"), value: "high" },
                { label: t("support.priority.urgent"), value: "urgent" },
              ]}
            />
          </Form.Item>
          {orders.length > 0 && (
            <Form.Item label={t("support.relatedOrder")}>
              <Select
                style={{ width: "100%" }}
                allowClear
                placeholder={t("support.relatedOrder")}
                value={newOrderId}
                onChange={setNewOrderId}
                options={orders.map((o) => ({ label: o.order_no, value: o.id }))}
              />
            </Form.Item>
          )}
          <Form.Item label={t("support.label.subject")}>
            <Input
              placeholder={t("support.defaultSubject")}
              value={newSubject}
              onChange={(e) => setNewSubject(e.target.value)}
            />
          </Form.Item>
          <Form.Item label={t("support.label.message")}>
            <Input.TextArea
              rows={4}
              placeholder={t("support.newPlaceholder")}
              value={newMsg}
              onChange={(e) => setNewMsg(e.target.value)}
            />
          </Form.Item>
          <Form.Item label={t("support.attachments")}>
            <AttachmentUploader value={newAttach} onChange={setNewAttach} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

function RateForm({
  onSubmit,
  placeholder,
  submitText,
}: {
  onSubmit: (rating: number, comment: string) => void;
  placeholder: string;
  submitText: string;
}) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  return (
    <Space direction="vertical" style={{ width: "100%" }}>
      <Rate value={rating} onChange={setRating} />
      <Input.TextArea rows={2} placeholder={placeholder} value={comment} onChange={(e) => setComment(e.target.value)} />
      <Button type="primary" disabled={rating === 0} onClick={() => onSubmit(rating, comment)}>
        {submitText}
      </Button>
    </Space>
  );
}
