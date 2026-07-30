import json
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy import select

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.catalog import Category
from app.models.content import Address, Banner, Promotion, PromotionType
from app.models.coupon import Coupon, CouponType, UserCoupon
from app.models.favorite import Favorite
from app.models.notification import Notification, NotificationType
from app.models.order import Order, OrderItem, OrderStatus
from app.models.points import PointLog, PointAction
from app.models.presale import Presale
from app.models.product import Product, ProductStatus
from app.models.reward import RedemptionItem, RedemptionType
from app.models.review import Review, Sentiment
from app.models.user import Role, User

DEMO_USERS = [
    ("admin", "admin@demo.shop", "admin123", Role.ADMIN),
    ("merchant", "merchant@demo.shop", "merchant123", Role.MERCHANT),
    ("merchant_2", "merchant_2@demo.shop", "merchant123", Role.MERCHANT),
    ("merchant_3", "merchant_3@demo.shop", "merchant123", Role.MERCHANT),
    ("merchant_4", "merchant_4@demo.shop", "merchant123", Role.MERCHANT),
    ("buyer", "buyer@demo.shop", "buyer123", Role.BUYER),
]

# 一级分类
TOP_CATS = [
    ("数码配件", "digital"),
    ("家居好物", "home"),
    ("文创周边", "culture"),
]
# 二级分类（挂在一级下）
SUB_CATS = {
    "digital": [("耳机音箱", "earphone"), ("充电储能", "charging"), ("智能穿戴", "wearable"), ("摄影配件", "photo"), ("游戏外设", "gaming")],
    "home": [("灯饰照明", "light"), ("厨房餐厨", "kitchen"), ("床品布艺", "textile"), ("收纳整理", "storage"), ("浴室用品", "bath"), ("家居装饰", "decor")],
    "culture": [("文具手账", "stationery"), ("手作文创", "handmade"), ("徽章贴纸", "badge"), ("读物周边", "book"), ("潮玩手办", "toy"), ("音乐周边", "music")],
}

# (名称, 二级分类slug, 描述, 价格, 库存, 销量)
PRODUCTS = [
    ("无线降噪耳机", "earphone", "48 小时续航，主动降噪，通勤出行安静相伴。", 299.0, 120, 860),
    ("入耳式运动耳机", "earphone", "防脱落耳翼设计，IPX5 防水，跑步健身不掉。", 129.0, 200, 1500),
    ("桌面蓝牙音箱", "earphone", "木质腔体，温润音色，桌面氛围感拉满。", 199.0, 100, 920),
    ("便携蓝牙音箱", "earphone", "巴掌大小，IPX7 防水，户外聚会随身音响。", 169.0, 150, 760),
    ("氮化镓快充头 65W", "charging", "三口输出，笔记本手机同时快充。", 99.0, 300, 2100),
    ("磁吸无线充电板", "charging", "随手一放即充，床头办公都方便。", 79.0, 250, 1300),
    ("20000mAh 充电宝", "charging", "大容量轻薄，飞机高铁都能带。", 139.0, 180, 1700),
    ("多彩编织数据线", "charging", "1.5 米加长，抗拉扯不打结。", 29.0, 500, 3200),
    ("智能运动手环", "wearable", "心率血氧监测，14 天超长续航。", 199.0, 120, 1100),
    ("户外运动手表", "wearable", "双频 GPS，百种运动模式，硬核玩家的腕上助手。", 599.0, 60, 540),
    ("健康智能戒指", "wearable", "无感佩戴，睡眠与压力全天候追踪。", 399.0, 40, 230),
    ("手机拍摄三脚架", "photo", "伸缩便携，直播 Vlog 稳如泰山。", 69.0, 220, 1450),
    ("桌面环形补光灯", "photo", "三色温调节，视频会议更上镜。", 119.0, 90, 880),
    ("复古胶片相机", "photo", "机械快门手感，记录有温度的日常。", 899.0, 25, 160),
    ("北欧风香薰灯", "light", "柔光护眼，木质底座，卧室松弛氛围。", 159.0, 80, 940),
    ("护眼学习台灯", "light", "国AA级照度，无频闪，久看不累。", 129.0, 140, 1230),
    ("极简氛围落地灯", "light", "客厅角落的一束光，提升空间质感。", 299.0, 50, 410),
    ("手冲咖啡入门套装", "kitchen", "滤杯手冲壶组合，宅家也能喝出风味。", 249.0, 40, 560),
    ("麦饭石不粘煎锅", "kitchen", "少油不粘，电磁炉燃气通用。", 89.0, 160, 1780),
    ("陶瓷餐具六件套", "kitchen", "釉下彩安全釉，餐桌颜值担当。", 159.0, 110, 990),
    ("纯棉四件套", "textile", "60 支长绒棉，裸睡级亲肤触感。", 299.0, 70, 870),
    ("大豆纤维护颈枕", "textile", "慢回弹支撑，告别落枕。", 79.0, 200, 1560),
    ("羊毛混纺盖毯", "textile", "秋冬沙发必备，暖而不闷。", 199.0, 90, 620),
    ("可折叠收纳箱", "storage", "一秒折叠，换季衣物整齐归位。", 49.0, 300, 2400),
    ("桌面多层置物架", "storage", "免打孔安装，桌面瞬间清爽。", 69.0, 180, 1320),
    ("真空压缩收纳袋", "storage", "省出一半衣柜空间。", 39.0, 400, 2900),
    ("手账本礼盒装", "stationery", "内页丰富，记录每一天的灵感。", 59.0, 150, 1100),
    ("彩色中性笔套装", "stationery", "0.5mm 顺滑书写，12 色随心搭。", 25.0, 600, 3500),
    ("便签纸砖", "stationery", "微粘可移，灵感随手贴。", 19.0, 500, 2600),
    ("戳戳绣 DIY 材料包", "handmade", "新手友好，半小时绣出治愈小画。", 49.0, 120, 720),
    ("微景观生态瓶", "handmade", "桌面上的小森林，养护超简单。", 89.0, 80, 430),
    ("羊毛毡材料包", "handmade", "戳出专属小玩偶，送礼有心意。", 39.0, 140, 680),
    ("金属珐琅徽章", "badge", "精致胸针，点亮背包与衣领。", 15.0, 800, 4200),
    ("夜光星球贴纸", "badge", "关灯发光，孩子的卧室星空。", 9.0, 1000, 5100),
    ("立体冰箱贴", "badge", "旅行记忆，厨房也很有戏。", 25.0, 500, 2300),
    ("独立设计杂志", "book", "每期一个城市主题，纸质阅读的温度。", 45.0, 200, 1300),
    ("解压涂色书", "book", "成人涂色，通勤地铁也能放松。", 35.0, 300, 1900),
    ("经典黑胶唱片", "book", "温暖模拟声，收藏当下好音乐。", 129.0, 80, 560),
    ("电竞头戴耳机", "earphone", "7.1 环绕声，听声辨位快人一步。", 349.0, 60, 480),
    ("高清网络摄像头", "photo", "1080P 自动对焦，居家办公利器。", 159.0, 90, 700),
    ("天然大豆香薰蜡烛", "light", "雪松木质调，助眠放松。", 69.0, 200, 1450),
    ("浴室防滑地垫", "textile", "吸水速干，呵护每一步。", 39.0, 300, 2100),
    ("原创帆布托特包", "handmade", "厚实帆布，通勤买菜一包搞定。", 59.0, 250, 1680),
    ("金属钥匙扣", "badge", "极简设计，日常陪伴小物。", 19.0, 600, 3400),
    ("加宽游戏鼠标垫", "charging", "锁边防滑，桌面整体性满分。", 29.0, 400, 2700),
    ("客制化机械键盘", "wearable", "热插拔轴体，手感随心调。", 399.0, 50, 390),
    ("门后收纳挂袋", "storage", "30 口袋设计，小物各归其位。", 35.0, 350, 1900),
    ("桌面陶瓷绿植盆", "kitchen", "哑光釉面，给工位添点绿。", 45.0, 220, 1050),
    ("和纸手帐胶带", "stationery", "低粘可撕，拼贴不出错。", 22.0, 500, 2400),
    ("1000 片治愈拼图", "book", "周末慢时光，拼完裱起来。", 79.0, 130, 610),
    ("铝合金平板支架", "photo", "多角度调节，颈椎更轻松。", 49.0, 260, 1500),
    ("Type-C 扩展坞", "charging", "七合一接口，一线连外设。", 59.0, 240, 1380),
    # ---- 新增二级分类商品（补齐二级分类覆盖，解决「内容太少」）----
    ("电竞无线鼠标", "gaming", "轻量化人体工学，超低延迟畅快开黑。", 199.0, 120, 980),
    ("无线游戏手柄", "gaming", "多平台兼容，震动反馈沉浸手感。", 249.0, 90, 720),
    ("速干亲肤浴巾", "bath", "吸水快干，浴后包裹柔软呵护。", 59.0, 200, 1340),
    ("沐浴精油套装", "bath", "舒缓香氛，泡澡放松一整天。", 89.0, 150, 680),
    ("抽象装饰画", "decor", "ins 风挂画，瞬间提升墙面格调。", 79.0, 180, 910),
    ("香薰扩香石", "decor", "无火扩香，呼吸间都是好心情。", 39.0, 300, 1560),
    ("盲盒手办摆件", "toy", "随机抽取惊喜，桌面治愈陪伴。", 69.0, 220, 1880),
    ("木质拼装模型", "toy", "动手拼出机械感，解压又有成就感。", 119.0, 110, 540),
    ("入门尤克里里", "music", "云杉面板，新手也能弹唱的小吉他。", 169.0, 80, 430),
]

REVIEW_TEXTS = {
    5: ["质量超出预期，做工很细，回购！", "用了一周，体验非常好，推荐。", "包装用心，质感在线，满意。", "性价比很高，朋友也种草了。"],
    4: ["整体不错，细节还能更好。", "挺好用的，物流也快。", "颜色比图片更耐看，喜欢。"],
    3: ["中规中矩，对得起价格。", "还行吧，没有特别惊艳。"],
    2: ["有一点小瑕疵，希望改进。", "和想象中有差距，凑合用。"],
    1: ["不太符合预期，客服处理还行。"],
}

SPEC_BASE = {"品牌": "优选好物", "产地": "中国", "售后": "一年质保"}
SPEC_EXTRA = {
    "earphone": {"类型": "耳机", "连接方式": "蓝牙 5.3"},
    "charging": {"类型": "充电配件", "接口": "Type-C"},
    "wearable": {"类型": "智能穿戴", "续航": "多日"},
    "photo": {"类型": "摄影配件", "材质": "铝合金"},
    "light": {"类型": "灯具", "色温": "三档可调"},
    "kitchen": {"类型": "厨房用品", "适用": "燃气/电磁"},
    "textile": {"类型": "家纺", "材质": "亲肤棉"},
    "storage": {"类型": "收纳", "特点": "可折叠"},
    "stationery": {"类型": "文具", "页数": "丰富"},
    "handmade": {"类型": "手作", "难度": "新手友好"},
    "badge": {"类型": "装饰", "材质": "金属/环保"},
    "book": {"类型": "读物", "装帧": "精装"},
    "gaming": {"类型": "游戏外设", "连接方式": "无线 2.4G"},
    "bath": {"类型": "浴室用品", "材质": "亲肤棉/环保"},
    "decor": {"类型": "家居装饰", "风格": "ins 风"},
    "toy": {"类型": "潮玩", "难度": "新手友好"},
    "music": {"类型": "乐器", "适用": "入门"},
}


def _make_specs(sub: str) -> str:
    return json.dumps({**SPEC_BASE, **SPEC_EXTRA.get(sub, {})}, ensure_ascii=False)


# ---- 商品图：本地 AI 生成渲染图 ----
# 由 image_gen 工具预生成到 backend/product_images/<商品名>.jpg，
# 后端经 /api/images/product/{name} 直接返回，离线、稳定、与商品一一对应、无水印。
#（积分商城兑换项仍使用 loremflickr，见下方 _img）

def _img(tag: str, w: int = 600, lock: int = 0) -> str:
    """返回 loremflickr 真实商品图片 URL。
    前端 ProductImage 会将外链转为 /api/images/proxy 代理请求 → 后端拉取并
    缓存到本地 .cache/img/ 目录。首次加载需联网，之后离线可用。
    lock=N 保证同一关键词组合始终返回同一张稳定图片。"""
    from urllib.parse import quote

    return f"https://loremflickr.com/{w}/{w}/{quote(tag)}?lock={lock}"


def _local_img(name: str) -> str:
    """返回本地 AI 生成商品图的 URL（后端 /api/images/product/{name} 静态读取）。"""
    from urllib.parse import quote

    return f"/api/images/product/{quote(name)}"


# 商品名 -> 图片键（首图 + 相册），保证图与商品一致
# 商品名 -> 图片关键词（首图 + 相册）。英文逗号分隔表示多标签，提高相关性。
# 商品名 -> 图片标签（首图 + 相册）。统一使用 loremflickr 图片池充足、且更“产品化”
# 的单词标签（已逐一验证可返回真实 JPEG，避免 500 / 场景图）。同标签不同 lock 即不同图。
PRODUCT_IMGS = {
    "无线降噪耳机": ("headphones", "headphones"),
    "入耳式运动耳机": ("earbuds", "earbuds"),
    "桌面蓝牙音箱": ("speaker", "speaker"),
    "便携蓝牙音箱": ("speaker", "speaker"),
    "氮化镓快充头 65W": ("charger", "charger"),
    "磁吸无线充电板": ("wirelesscharger", "wirelesscharger"),
    "20000mAh 充电宝": ("powerbank", "powerbank"),
    "多彩编织数据线": ("cable", "cable"),
    "智能运动手环": ("fitnessband", "fitnessband"),
    "户外运动手表": ("smartwatch", "smartwatch"),
    "健康智能戒指": ("smartring", "smartring"),
    "手机拍摄三脚架": ("tripod", "tripod"),
    "桌面环形补光灯": ("ringlight", "ringlight"),
    "复古胶片相机": ("camera", "camera"),
    "北欧风香薰灯": ("lamp", "lamp"),
    "护眼学习台灯": ("desklamp", "desklamp"),
    "极简氛围落地灯": ("floorlamp", "floorlamp"),
    "手冲咖啡入门套装": ("coffeemaker", "coffeemaker"),
    "麦饭石不粘煎锅": ("pan", "pan"),
    "陶瓷餐具六件套": ("tableware", "tableware"),
    "纯棉四件套": ("bedding", "bedding"),
    "大豆纤维护颈枕": ("pillow", "pillow"),
    "羊毛混纺盖毯": ("blanket", "blanket"),
    "可折叠收纳箱": ("storagebox", "storagebox"),
    "桌面多层置物架": ("shelf", "shelf"),
    "真空压缩收纳袋": ("storagebag", "storagebag"),
    "手账本礼盒装": ("notebook", "notebook"),
    "彩色中性笔套装": ("pen", "pen"),
    "便签纸砖": ("stickynotes", "stickynotes"),
    "戳戳绣 DIY 材料包": ("embroidery", "embroidery"),
    "微景观生态瓶": ("terrarium", "terrarium"),
    "羊毛毡材料包": ("felt", "felt"),
    "金属珐琅徽章": ("badge", "badge"),
    "夜光星球贴纸": ("sticker", "sticker"),
    "立体冰箱贴": ("fridgemagnet", "fridgemagnet"),
    "独立设计杂志": ("magazine", "magazine"),
    "解压涂色书": ("coloringbook", "coloringbook"),
    "经典黑胶唱片": ("vinyl", "vinyl"),
    "电竞头戴耳机": ("headset", "headset"),
    "高清网络摄像头": ("camera", "camera"),
    "天然大豆香薰蜡烛": ("candle", "candle"),
    "浴室防滑地垫": ("bathmat", "bathmat"),
    "原创帆布托特包": ("totebag", "totebag"),
    "金属钥匙扣": ("keyring", "keyring"),
    "加宽游戏鼠标垫": ("mouse", "mouse"),
    "客制化机械键盘": ("keyboard", "keyboard"),
    "门后收纳挂袋": ("organizer", "organizer"),
    "桌面陶瓷绿植盆": ("planter", "planter"),
    "和纸手帐胶带": ("washitape", "washitape"),
    "1000 片治愈拼图": ("puzzle", "puzzle"),
    "铝合金平板支架": ("tabletstand", "tabletstand"),
    "Type-C 扩展坞": ("hub", "hub"),
    "电竞无线鼠标": ("mouse", "mouse"),
    "无线游戏手柄": ("gamepad", "gamepad"),
    "速干亲肤浴巾": ("towel", "towel"),
    "沐浴精油套装": ("bath", "bath"),
    "抽象装饰画": ("poster", "poster"),
    "香薰扩香石": ("diffuser", "diffuser"),
    "盲盒手办摆件": ("figure", "figure"),
    "木质拼装模型": ("model", "model"),
    "入门尤克里里": ("ukulele", "ukulele"),
}


async def seed_demo() -> None:
    async with SessionLocal() as db:
        existing = await db.scalar(select(User).where(User.username == "admin"))
        if existing:
            return

        users = {}
        for username, email, password, role in DEMO_USERS:
            u = User(
                username=username,
                email=email,
                hashed_password=hash_password(password),
                role=role,
            )
            db.add(u)
            users[username] = u
        await db.flush()

        # 商家头像与店铺简介（供店铺页展示）
        SHOP_PROFILES = {
            "merchant": ("优选数码旗舰店", "专注高性价比数码配件，每一件都经过真机实测。"),
            "merchant_2": ("鲜物生活集市", "严选当季生鲜与家居好物，让生活更有温度。"),
            "merchant_3": ("云上服饰馆", "简约不简单的日常穿搭，主打舒适与质感。"),
            "merchant_4": ("美味零食铺", "网罗全球零食，满足每一刻的馋嘴时光。"),
        }
        for uname, (title, desc) in SHOP_PROFILES.items():
            if uname in users:
                users[uname].avatar = f"https://picsum.photos/seed/{uname}-logo/200/200"
                users[uname].description = desc

        # ---- 分类（一级 + 二级）----
        top_cats = {}
        for name, slug in TOP_CATS:
            c = Category(name=name, slug=slug)
            db.add(c)
            top_cats[slug] = c
        await db.flush()
        sub_cats = {}
        for top, subs in SUB_CATS.items():
            for name, slug in subs:
                c = Category(name=name, slug=slug, parent_id=top_cats[top].id)
                db.add(c)
                sub_cats[slug] = c
        await db.flush()

        # ---- 商品 ----
        merchants = ["merchant", "merchant_2", "merchant_3", "merchant_4"]
        products: dict[str, Product] = {}
        for i, (name, sub, desc, price, stock, sales) in enumerate(PRODUCTS, start=1):
            slug = f"p{i}"
            imgs = [_local_img(name)]
            p = Product(
                merchant_id=users[merchants[i % len(merchants)]].id,
                category_id=sub_cats[sub].id,
                name=name,
                description=desc,
                price=price,
                stock=stock,
                sales_count=sales,
                image_url=imgs[0],
                images=json.dumps(imgs),
                specs=json.dumps({**SPEC_BASE, **SPEC_EXTRA.get(sub, {})}, ensure_ascii=False),
                status=ProductStatus.ACTIVE,
            )
            db.add(p)
            products[slug] = p
        await db.flush()

        # ---- 一个已完成订单（满足评价外键，并给买家一条真实订单）----
        order = Order(
            order_no="SEED-" + uuid4().hex[:8].upper(),
            buyer_id=users["buyer"].id,
            status=OrderStatus.COMPLETED,
            total_amount=627.0,
            address="浙江省杭州市余杭区文一西路 969 号 1 号楼",
            paid_at=datetime.now(timezone.utc) - timedelta(days=5),
            completed_at=datetime.now(timezone.utc) - timedelta(days=3),
        )
        db.add(order)
        await db.flush()
        for slug in ("p1", "p15", "p27"):
            db.add(
                OrderItem(
                    order_id=order.id,
                    product_id=products[slug].id,
                    quantity=1,
                    price=products[slug].price,
                )
            )
        await db.flush()

        # ---- 批量评价（驱动评分/好评榜）----
        buyer = users["buyer"]
        STAR_POOL = [5, 4, 4, 3, 2, 1]  # 评分分布池：覆盖好评到差评，评分分布更真实
        for slug, p in products.items():
            count = (hash(slug) % 4) + 3  # 3~6 条，保证任意商品 ≥3 条评价
            kw = PRODUCT_IMGS[p.name][0] if p.name in PRODUCT_IMGS else p.name
            for k in range(count):
                rating = STAR_POOL[(hash(slug) + k) % len(STAR_POOL)]
                text = REVIEW_TEXTS[rating][k % len(REVIEW_TEXTS[rating])]
                sentiment = (
                    Sentiment.POSITIVE if rating >= 4
                    else Sentiment.NEUTRAL if rating == 3 else Sentiment.NEGATIVE
                )
                # 好评部分带图，差评(1~2星)不带图，满足「含带图/差评」
                imgs = [_img(kw, 400)] if rating >= 4 and k % 2 == 0 else []
                db.add(
                    Review(
                        order_id=order.id,
                        product_id=p.id,
                        user_id=buyer.id,
                        rating=rating,
                        content=text,
                        sentiment=sentiment,
                        _images=json.dumps(imgs, ensure_ascii=False),
                    )
                )
        await db.flush()

        # ---- 优惠券（平台 + 店铺）----
        _now = datetime.now(timezone.utc)
        coupons = [
            Coupon(name="新人专享券（满100减20）", type=CouponType.FULL_REDUCE, threshold=100, value=20, total=200, end_at=_now + timedelta(days=30)),
            Coupon(name="全平台满200减30", type=CouponType.FULL_REDUCE, threshold=200, value=30, total=200, end_at=_now + timedelta(days=60)),
            Coupon(name="数码品类券（满300减50）", type=CouponType.FULL_REDUCE, threshold=300, value=50, total=150, merchant_id=users["merchant"].id, applicable_category="digital", end_at=_now + timedelta(days=45)),
            Coupon(name="家居满150减25", type=CouponType.FULL_REDUCE, threshold=150, value=25, total=150, merchant_id=users["merchant_2"].id, applicable_category="home", end_at=_now + timedelta(days=90)),
            Coupon(name="文创满99减15", type=CouponType.FULL_REDUCE, threshold=99, value=15, total=150, applicable_category="culture", end_at=_now + timedelta(days=30)),
            Coupon(name="会员折扣券（8.8折）", type=CouponType.DISCOUNT, threshold=0, value=0.88, total=100, end_at=_now + timedelta(days=180)),
            Coupon(name="限时秒杀补给券（满50减10）", type=CouponType.FULL_REDUCE, threshold=50, value=10, total=300, end_at=_now + timedelta(days=3)),
        ]
        for c in coupons:
            db.add(c)
        await db.flush()
        # 给买家发一张已领取券
        db.add(UserCoupon(user_id=buyer.id, coupon_id=coupons[0].id))

        # ---- 促销活动（秒杀）----
        now = datetime.now(timezone.utc)
        promo_products = ["p1", "p3", "p5", "p10", "p16", "p21"]
        for idx, slug in enumerate(promo_products):
            p = products[slug]
            db.add(
                Promotion(
                    title=f"{p.name} 限时秒杀",
                    type=PromotionType.FLASH,
                    product_id=p.id,
                    discount_price=round(p.price * 0.7, 2),
                    start_at=now - timedelta(hours=1),
                    end_at=now + timedelta(days=2),
                )
            )

        # ---- 首页轮播 Banner ----
        banners = [
            ("新人专享 满100减20", _img("headphones", 1200), "category", "digital"),
            ("家居好物 焕新季", _img("lamp", 1200), "category", "home"),
            ("文创周边 治愈小物", _img("notebook", 1200), "category", "culture"),
            ("限时秒杀 低至7折", _img("gift", 1200), "url", None),
        ]
        for i, (title, img, ltype, lid) in enumerate(banners, start=1):
            db.add(
                Banner(
                    title=title,
                    image_url=img,
                    link_type=ltype,
                    link_id=lid,
                    link_url="http://localhost:5173/" if ltype == "url" else None,
                    sort_order=i,
                )
            )

        # ---- 预售活动（定金膨胀：付定金 X 抵 X*inflate_rate，到期付尾款转订单）----
        # (商品slug, 商家, 标题, 原价参考, 定金, 膨胀系数, 截止天数)
        # 预售价按商品原价 8 折生成（original_price 仍展示商品原价），保证页面可见真实折扣
        PRESALES = [
            ("p1", "merchant", "无线降噪耳机 尝鲜预售", 299.0, 50.0, 1.5, 7),
            ("p14", "merchant", "复古胶片相机 限量预售", 899.0, 200.0, 2.0, 10),
            ("p10", "merchant", "户外运动手表 新品预售", 599.0, 100.0, 1.8, 14),
            ("p90", "merchant", "客制化机械键盘 团购预售", 399.0, 80.0, 1.5, 12),
            ("p22", "merchant_3", "微景观生态瓶 治愈预售", 89.0, 15.0, 2.0, 5),
            ("p106", "merchant_3", "经典黑胶唱片 收藏预售", 129.0, 30.0, 2.0, 9),
            ("p36", "merchant_2", "北欧风香薰灯 节日预售", 159.0, 30.0, 2.0, 6),
            ("p63", "merchant_2", "手冲咖啡入门套装 预售", 249.0, 50.0, 1.8, 8),
        ]
        for slug, m_uname, title, _orig, deposit, rate, days in PRESALES:
            if slug not in products or m_uname not in users:
                continue
            presale_price = round(float(products[slug].price) * 0.8, 2)
            db.add(
                Presale(
                    merchant_id=users[m_uname].id,
                    product_id=products[slug].id,
                    title=title,
                    presale_price=presale_price,
                    deposit=deposit,
                    inflate_rate=rate,
                    end_at=now + timedelta(days=days),
                    is_active=1,
                )
            )

        # ---- 买家侧内容：通知 / 积分 / 收藏 / 地址 ----
        notifications = [
            ("订单已签收", "您的订单已确认收货，期待好评～", NotificationType.ORDER),
            ("签到提醒", "每日签到领取积分，积分为你省更多。", NotificationType.POINTS),
            ("优惠券到账", "您领取的「新人专享券」已存入卡包。", NotificationType.COUPON),
            ("上新通知", "你关注的「数码配件」有新商品上架。", NotificationType.SYSTEM),
            ("会员福利", "积分可兑换专属优惠券，速去积分商城看看。", NotificationType.POINTS),
        ]
        for title, content, ntype in notifications:
            db.add(Notification(user_id=buyer.id, type=ntype, title=title, content=content))

        db.add(PointLog(user_id=buyer.id, action=PointAction.ADMIN_ADJUST, delta=8000, balance=8000, remark="积分商城体验赠送"))
        db.add(PointLog(user_id=buyer.id, action=PointAction.ORDER_COMPLETE, delta=62, balance=8062, remark="订单完成奖励"))
        db.add(PointLog(user_id=buyer.id, action=PointAction.SIGNIN, delta=5, balance=8067, remark="每日签到"))
        users["buyer"].points = 8067  # 同步积分余额

        # ---- 积分商城兑换项 ----
        RED_ITEMS = [
            ("5元无门槛券", "全场通用，下单立减 5 元", "full_reduce", 0, 5, 500, "coupon"),
            ("满99减15券", "满 99 元可用，省到就是赚到", "full_reduce", 99, 15, 800, "gift"),
            ("满199减30券", "大促囤货必备，满 199 减 30", "full_reduce", 199, 30, 1500, "present"),
            ("9折无门槛券", "全单 9 折，上不封顶", "discount", 0, 0.9, 600, "sale"),
            ("视频会员月卡", "兑换即享热门平台 30 天会员", None, 0, 0, 2000, "streaming"),
            ("限定帆布包", "积分兑换周边好物（实物包邮）", None, 0, 0, 3000, "tote,bag"),
        ]
        for idx, (name, desc, ctype, thr, val, cost, img_key) in enumerate(RED_ITEMS, start=1):
            db.add(
                RedemptionItem(
                    name=name,
                    description=desc,
                    image_url=_img(img_key, 400),
                    cost_points=cost,
                    type=RedemptionType.VIRTUAL if ctype is None else RedemptionType.COUPON,
                    stock=0,
                    coupon_type=ctype,
                    coupon_threshold=thr,
                    coupon_value=val,
                    coupon_expire_days=30,
                    is_active=True,
                )
            )

        for slug in ("p2", "p8", "p19", "p33"):
            db.add(Favorite(user_id=buyer.id, product_id=products[slug].id))

        db.add(
            Address(
                user_id=buyer.id,
                receiver="示例用户",
                phone="13800000000",
                province="浙江省",
                city="杭州市",
                district="余杭区",
                detail="文一西路 969 号 1 号楼",
                is_default=1,
            )
        )
        db.add(
            Address(
                user_id=buyer.id,
                receiver="公司收",
                phone="13900000000",
                province="上海市",
                city="上海市",
                district="浦东新区",
                detail="世纪大道 100 号",
                is_default=0,
            )
        )

        await db.commit()


if __name__ == "__main__":
    import asyncio

    asyncio.run(seed_demo())
    print("种子数据写入完成")
