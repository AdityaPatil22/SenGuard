from pydantic import BaseModel


class SkillCreate(BaseModel):
    name: str
    description: str | None = None
    skill_type: str
    content: str | None = None


class SkillUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    content: str | None = None
