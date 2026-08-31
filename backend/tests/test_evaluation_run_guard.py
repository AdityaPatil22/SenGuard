import pytest

from app.models.evaluation import Evaluation, EvaluationStatus
from app.repositories.evaluation import EvaluationRepository


@pytest.mark.asyncio
async def test_claim_for_run_is_race_safe(db_session):
    evaluation = Evaluation(status=EvaluationStatus.PENDING)
    db_session.add(evaluation)
    await db_session.flush()
    await db_session.refresh(evaluation)

    repo = EvaluationRepository(db_session)

    first = await repo.claim_for_run(evaluation.id)
    second = await repo.claim_for_run(evaluation.id)

    assert first is not None
    assert first.status == EvaluationStatus.RUNNING
    assert second is None  # already claimed, no double-run
