from sqlalchemy import select

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.catalog import Category
from app.models.product import Product, ProductStatus
from app.models.user import Role, User

DEMO_USERS = [
    ("admin", "admin@demo.shop", "admin123", Role.ADMIN),
    ("merchant", "merchant@demo.shop", "merchant123", Role.MERCHANT),
    ("buyer", "buyer@demo.shop", "buyer123", Role.BUYER),
]

DEMO_CATEGORIES = [
    ("数码配件", "digital"),
    ("家居好物", "home"),
    ("文创周边", "culture"),
]

DEMO_PRODUCTS = [
    ("无线降噪耳机", "digital", "48 小时续航，主动降噪，通勤出行安静相伴。", 299.0, 120),
    ("北欧风香薰灯", "home", "柔光护眼，木质底座，营造卧室松弛氛围。", 159.0, 80),
    ("复古帆布双肩包", "culture", "加厚帆布，容量能装，校园通勤百搭。", 129.0, 60),
    ("便携蓝牙音箱", "digital", "巴掌大小，IPX7 防水，户外聚会随身音响。", 199.0, 100),
    ("手冲咖啡套装", "home", "入门级手冲组合，宅家也能喝到风味咖啡。", 249.0, 40),
]


async def seed_demo() -> None:
    async with SessionLocal() as db:
        existing = await db.scalar(select(User).where(User.username == "admin"))
        if existing:
            return

        users = {}
        for username, email, password, role in DEMO_USERS:
            user = User(
                username=username,
                email=email,
                hashed_password=hash_password(password),
                role=role,
            )
            db.add(user)
            users[role.value] = user
        await db.flush()

        cat_map = {}
        for name, slug in DEMO_CATEGORIES:
            cat = Category(name=name, slug=slug)
            db.add(cat)
            cat_map[slug] = cat
        await db.flush()

        merchant_id = users["merchant"].id
        for name, slug, desc, price, stock in DEMO_PRODUCTS:
            db.add(
                Product(
                    merchant_id=merchant_id,
                    category_id=cat_map[slug].id,
                    name=name,
                    description=desc,
                    price=price,
                    stock=stock,
                    image_url=f"https://placehold.co/600x400/4F46E5/FFFFFF?text={name}",
                    status=ProductStatus.ACTIVE,
                )
            )
        await db.commit()
