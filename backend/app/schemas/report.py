from pydantic import BaseModel


class ReportResponse(BaseModel):
    id: str
    content: str | None
    status: str
    rejection_comment: str | None
    evaluation_id: str
    reviewer_id: str | None
    project_id: str
    project_name: str
    risk_score: float | None
    created_at: str
    updated_at: str


class ReportReject(BaseModel):
    comment: str
