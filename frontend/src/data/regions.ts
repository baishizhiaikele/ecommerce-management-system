// 省市区演示数据源（Cascader 用）。
// 注：仅覆盖常用地区子集，便于演示级联选择；生产环境应接入完整行政区划数据。
export interface RegionNode {
  value: string;
  label: string;
  children?: RegionNode[];
}

export const REGION_OPTIONS: RegionNode[] = [
  {
    value: "北京市",
    label: "北京市",
    children: [
      {
        value: "北京市",
        label: "北京市",
        children: [
          { value: "东城区", label: "东城区" },
          { value: "西城区", label: "西城区" },
          { value: "朝阳区", label: "朝阳区" },
          { value: "海淀区", label: "海淀区" },
        ],
      },
    ],
  },
  {
    value: "上海市",
    label: "上海市",
    children: [
      {
        value: "上海市",
        label: "上海市",
        children: [
          { value: "黄浦区", label: "黄浦区" },
          { value: "徐汇区", label: "徐汇区" },
          { value: "浦东新区", label: "浦东新区" },
        ],
      },
    ],
  },
  {
    value: "广东省",
    label: "广东省",
    children: [
      {
        value: "广州市",
        label: "广州市",
        children: [
          { value: "天河区", label: "天河区" },
          { value: "越秀区", label: "越秀区" },
          { value: "番禺区", label: "番禺区" },
        ],
      },
      {
        value: "深圳市",
        label: "深圳市",
        children: [
          { value: "南山区", label: "南山区" },
          { value: "福田区", label: "福田区" },
          { value: "宝安区", label: "宝安区" },
        ],
      },
    ],
  },
  {
    value: "浙江省",
    label: "浙江省",
    children: [
      {
        value: "杭州市",
        label: "杭州市",
        children: [
          { value: "西湖区", label: "西湖区" },
          { value: "拱墅区", label: "拱墅区" },
          { value: "余杭区", label: "余杭区" },
        ],
      },
      {
        value: "宁波市",
        label: "宁波市",
        children: [
          { value: "海曙区", label: "海曙区" },
          { value: "江北区", label: "江北区" },
        ],
      },
    ],
  },
  {
    value: "江苏省",
    label: "江苏省",
    children: [
      {
        value: "南京市",
        label: "南京市",
        children: [
          { value: "玄武区", label: "玄武区" },
          { value: "鼓楼区", label: "鼓楼区" },
        ],
      },
      {
        value: "苏州市",
        label: "苏州市",
        children: [
          { value: "姑苏区", label: "姑苏区" },
          { value: "工业园区", label: "工业园区" },
        ],
      },
    ],
  },
  {
    value: "四川省",
    label: "四川省",
    children: [
      {
        value: "成都市",
        label: "成都市",
        children: [
          { value: "锦江区", label: "锦江区" },
          { value: "武侯区", label: "武侯区" },
          { value: "高新区", label: "高新区" },
        ],
      },
    ],
  },
];
