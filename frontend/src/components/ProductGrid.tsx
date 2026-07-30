import { Col, Row } from "antd";
import { ProductOut } from "../api";
import ProductCard from "./ProductCard";

/**
 * L4：响应式商品网格，统一首页/搜索结果等处的 Row/Col 栅格布局。
 * 默认断点为 12/8/6/4，可按场景覆盖。
 */
export default function ProductGrid({
  items,
  gutter = [16, 16],
  xs = 12,
  sm = 8,
  md = 6,
  lg = 4,
}: {
  items: ProductOut[];
  gutter?: [number, number];
  xs?: number;
  sm?: number;
  md?: number;
  lg?: number;
}) {
  return (
    <Row gutter={gutter}>
      {items.map((p) => (
        <Col key={p.id} xs={xs} sm={sm} md={md} lg={lg}>
          <ProductCard p={p} />
        </Col>
      ))}
    </Row>
  );
}
