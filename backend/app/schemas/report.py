from pydantic import BaseModel


class ReportReject(BaseModel):
    comment: str
