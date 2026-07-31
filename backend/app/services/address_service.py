"""P1-6 地址智能解析：将用户粘贴的自由文本地址解析为省/市/区 + 详细地址。

离线关键词匹配，无需外部 API（无密钥依赖）。覆盖全国 34 个省级行政区与
常见地级市，命中则返回结构化结果，未命中返回原文并标记 confidence=low。
"""
from __future__ import annotations

import re

# 省级行政区关键词（含直辖市/自治区/特别行政区简称）
_PROVINCES = [
    "北京市", "天津市", "上海市", "重庆市",
    "河北省", "山西省", "辽宁省", "吉林省", "黑龙江省", "江苏省", "浙江省",
    "安徽省", "福建省", "江西省", "山东省", "河南省", "湖北省", "湖南省",
    "广东省", "海南省", "四川省", "贵州省", "云南省", "陕西省", "甘肃省",
    "青海省", "台湾省",
    "内蒙古自治区", "广西壮族自治区", "西藏自治区", "宁夏回族自治区",
    "新疆维吾尔自治区", "香港特别行政区", "澳门特别行政区",
]
# 常用简称（与全称均可匹配）
_PROVINCE_ALIAS = {
    "北京": "北京市", "天津": "天津市", "上海": "上海市", "重庆": "重庆市",
    "河北": "河北省", "山西": "山西省", "辽宁": "辽宁省", "吉林": "吉林省",
    "黑龙江": "黑龙江省", "江苏": "江苏省", "浙江": "浙江省", "安徽": "安徽省",
    "福建": "福建省", "江西": "江西省", "山东": "山东省", "河南": "河南省",
    "湖北": "湖北省", "湖南": "湖南省", "广东": "广东省", "海南": "海南省",
    "四川": "四川省", "贵州": "贵州省", "云南": "云南省", "陕西": "陕西省",
    "甘肃": "甘肃省", "青海": "青海省", "内蒙": "内蒙古自治区", "内蒙古": "内蒙古自治区",
    "广西": "广西壮族自治区", "西藏": "西藏自治区", "宁夏": "宁夏回族自治区",
    "新疆": "新疆维吾尔自治区", "香港": "香港特别行政区", "澳门": "澳门特别行政区",
    "台湾": "台湾省",
}
# 部分高频城市（用于省市同名的直辖市/单列市细化）
_CITIES_HINT = [
    "广州市", "深圳市", "东莞市", "佛山市", "珠海市", "杭州市", "宁波市", "温州市",
    "南京市", "苏州市", "无锡市", "常州市", "成都市", "武汉市", "西安市", "郑州市",
    "青岛市", "济南市", "长沙市", "南昌市", "福州市", "厦门市", "合肥市", "昆明市",
    "贵阳市", "沈阳市", "大连市", "哈尔滨市", "长春市", "石家庄市", "太原市",
]
_DISTRICT_SUFFIX = ("区", "县", "市辖区", "新区", "开发区", "高新区", "郊区", "旗")


def parse_address(text: str) -> dict:
    """解析自由文本地址，返回 {province, city, district, detail, confidence}。"""
    raw = (text or "").strip()
    if not raw:
        return {"province": None, "city": None, "district": None, "detail": raw, "confidence": "none"}

    province = None
    for p in _PROVINCES:
        if p in raw:
            province = p
            break
    if province is None:
        for alias, full in _PROVINCE_ALIAS.items():
            if alias in raw:
                province = full
                break

    # 城市：优先在原文中匹配高频城市，再从"省X市"模式提取
    city = None
    for c in _CITIES_HINT:
        if c in raw:
            city = c
            break
    if city is None and province:
        m = re.search(r"[一-龥]{2,10}?(市|自治州|盟)", raw)
        if m and m.group(0) not in province:
            city = m.group(0)

    # 区县：在剔除省/市后的剩余文本中匹配 "X区/X县/X旗"（限 2-4 字，避免吞掉省市）
    remainder = raw
    for piece in (province, city):
        if piece and piece in remainder:
            remainder = remainder.replace(piece, "", 1)
    district = None
    for suff in ("市辖区", "新区", "开发区", "高新区"):
        if suff in remainder:
            district = suff
            break
    if district is None:
        m = re.search(r"[一-龥]{1,4}?(区|县|旗)", remainder)
        if m:
            district = m.group(0)

    # 详细地址：去掉已识别的省市区片段后的剩余文本
    detail = raw
    for piece in (province, city, district):
        if piece and piece in detail:
            detail = detail.replace(piece, "", 1)
    detail = detail.strip(" ，,。.　-")

    confidence = "high" if (province and city) else ("medium" if province else "low")
    return {
        "province": province,
        "city": city,
        "district": district,
        "detail": detail or raw,
        "confidence": confidence,
    }
