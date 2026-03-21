from fastapi import APIRouter, Query
from src.shared.dependencies import alarm_repo, graph_engine
from src.analytics.get_alarms import GetActiveAlarmsUseCase

router = APIRouter(prefix="/discovery", tags=["alarms"])

@router.get("/alarms/{node_id}")
async def get_node_alarms(node_id: str, include_downstream: bool = Query(True)):
    """Fetch active alarms for a node and optionally its downstream children."""
    use_case = GetActiveAlarmsUseCase(alarm_repo, graph_engine)
    alarms = use_case.execute(node_id, include_downstream)
    return [a.dict() for a in alarms]
