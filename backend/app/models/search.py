from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Integer, String

from app.db.base import Base


class SearchKeyword(Base):
    __tablename__ = "search_keywords"

    keyword = Column(String(120), primary_key=True)
    count = Column(Integer, nullable=False, default=1)
    last_searched = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
