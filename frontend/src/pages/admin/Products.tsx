import { useEffect, useState } from "react";
import type { AxiosError } from "axios";
import { Table, Button, Tag, message, Card, Select, Popconfirm, Spin } from "antd";
import EmptyState from "../../components/EmptyState";
import { adminListProducts, setProductStatus, ProductOut, ProductStatus } from "../../api";
import { money, productStatusMeta } from "../../utils/format";
import { useI18n } from "../../i18n";

export default function AdminProducts() {
  const { t } = useI18n();
  const [items, setItems] = useState<ProductOut[]>([]);
  const [filter, setFilter] = useState<ProductStatus | "all">("all");
  const [loading, setLoading] = useState(true);
  const load = async () => {
    setLoading(true);
    try {
      setItems(await adminListProducts(filter === "all" ? undefined : filter));
    } catch {
      /* 忽略 */
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, [filter]);

  const approve = async (id: string) => {
    try {
      await setProductStatus(id, "active");
      message.success(t("admin.online"));
      load();
    } catch (e) {
      const err = e as AxiosError<any, any>;
      message.error(err.response?.data?.detail || t("common.operationFailed"));
    }
  };
  const reject = async (id: string) => {
    try {
      await setProductStatus(id, "rejected", "不符合平台规范");
      message.success(t("admin.rejected"));
      load();
    } catch (e) {
      const err = e as AxiosError<any, any>;
      message.error(err.response?.data?.detail || t("common.operationFailed"));
    }
  };

  return (
    <Card
      title={t("admin.productReview")}
      className="soft-card"
      extra={
        <Select
          value={filter}
          style={{ width: 160 }}
          onChange={setFilter}
          options={[
            { value: "all", label: t("common.all") },
            { value: "pending", label: t("admin.pending") },
            { value: "active", label: t("admin.online") },
            { value: "rejected", label: t("admin.rejected") },
            { value: "draft", label: t("common.draft") },
          ]}
        />
      }
    >
      {loading ? (
        <div className="text-center py-10">
          <Spin />
        </div>
      ) : (
        <Table
          rowKey="id"
          dataSource={items}
          pagination={false}
          locale={{
            emptyText: (
              <EmptyState
                title={t("admin.noProducts")}
                description={t("admin.noProductsDesc")}
              />
            ),
          }}
          columns={[
            { title: t("col.name"), dataIndex: "name" },
            { title: t("col.price"), dataIndex: "price", render: (v) => `¥${money(v)}` },
            { title: t("col.stock"), dataIndex: "stock" },
            {
              title: t("common.status"),
              dataIndex: "status",
              render: (s: ProductStatus) => <Tag color={productStatusMeta[s].color}>{productStatusMeta[s].label}</Tag>,
            },
            { title: t("admin.rejectReason"), dataIndex: "reject_reason", render: (v) => v || "-" },
            {
              title: t("common.action"),
              render: (_, r) => (
                <span className="flex gap-1">
                  {r.status === "pending" && (
                    <Button type="link" onClick={() => approve(r.id)}>
                      {t("admin.approve")}
                    </Button>
                  )}
                  {(r.status === "pending" || r.status === "active") && (
                    <Popconfirm title={t("admin.confirmReject")} onConfirm={() => reject(r.id)}>
                      <Button type="link" danger>
                        {t("admin.reject")}
                      </Button>
                    </Popconfirm>
                  )}
                </span>
              ),
            },
          ]}
        />
      )}
    </Card>
  );
}
