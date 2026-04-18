from fastapi import APIRouter, Query, HTTPException
from fastapi.concurrency import run_in_threadpool
from src.shared.dependencies import graph_engine, meter_data_repo, ensure_graph_built
from src.analytics.calculate_voltage import CalculateVoltageDistributionUseCase
from src.analytics.phase_balancing import PhaseBalancingUseCase
from src.analytics.calculate_consumption import CalculateAggregateConsumptionUseCase
from src.analytics.map_voltage import MapVoltageUseCase

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

# Use cases
voltage_uc = CalculateVoltageDistributionUseCase(graph_engine, meter_data_repo)
phase_uc = PhaseBalancingUseCase(graph_engine, meter_data_repo)
consumption_uc = CalculateAggregateConsumptionUseCase(graph_engine, meter_data_repo)
map_voltage_uc = MapVoltageUseCase(graph_engine, meter_data_repo)

@router.get("/voltage/{node_id}/estimate")
async def get_voltage_estimate(
    node_id: str, 
    start_time: str = Query(..., description="ISO 8601 start time"), 
    end_time: str = Query(..., description="ISO 8601 end time"),
    degrees: int = Query(None, description="Degrees of separation for nearby node analysis")
):
    """Returns row count estimate for voltage distribution."""
    ensure_graph_built()
    node_ids = node_id.split(",")
    return voltage_uc.estimate(node_ids, start_time, end_time, degrees=degrees)

@router.get("/voltage/{node_id}")
async def get_voltage_distribution(
    node_id: str, 
    start_time: str = Query(..., description="ISO 8601 start time"), 
    end_time: str = Query(..., description="ISO 8601 end time"),
    degrees: int = Query(None, description="Degrees of separation for nearby node analysis")
):
    """Calculates voltage distribution downstream of nodes."""
    ensure_graph_built()
    node_ids = node_id.split(",")
    result = voltage_uc.execute(node_ids, start_time, end_time, degrees=degrees)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result

@router.get("/phase-balance/{node_id}")
async def get_phase_balance(
    node_id: str, 
    start_time: str = Query(..., description="ISO 8601 start time"), 
    end_time: str = Query(..., description="ISO 8601 end time")
):
    """Calculates phase imbalance downstream of a node."""
    ensure_graph_built()
    result = phase_uc.execute(node_id, start_time, end_time)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result

@router.get("/consumption/{node_id}/estimate")
async def get_consumption_estimate(
    node_id: str, 
    start_time: str = Query(..., description="ISO 8601 start time"), 
    end_time: str = Query(..., description="ISO 8601 end time")
):
    """Returns row count estimate for consumption aggregation."""
    ensure_graph_built()
    node_ids = node_id.split(",")
    return consumption_uc.estimate(node_ids, start_time, end_time)

@router.get("/consumption/{node_id}")
async def get_consumption(
    node_id: str, 
    start_time: str = Query(..., description="ISO 8601 start time"), 
    end_time: str = Query(..., description="ISO 8601 end time")
):
    """Calculates aggregate consumption for nodes."""
    ensure_graph_built()
    node_ids = node_id.split(",")
    result = consumption_uc.execute(node_ids, start_time, end_time)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result

@router.get("/map-voltage/estimate")
async def get_map_voltage_estimate(
    start_time: str = Query(..., description="ISO 8601 start time"), 
    end_time: str = Query(..., description="ISO 8601 end time"),
    agg: str = Query("median", description="Aggregation method: min, max, median, mean"),
    node_id: str = Query(None, description="Optional node to trace downstream from")
):
    """Returns row count estimate for map voltage summary."""
    ensure_graph_built()
    return map_voltage_uc.estimate(start_time, end_time, agg, node_id)

@router.get("/map-voltage")
async def get_map_voltage(
    start_time: str = Query(..., description="ISO 8601 start time"), 
    end_time: str = Query(..., description="ISO 8601 end time"),
    agg: str = Query("median", description="Aggregation method: min, max, median, mean"),
    node_id: str = Query(None, description="Optional node to trace downstream from")
):
    """Calculates node voltage summary for the entire map or a subset."""
    ensure_graph_built()
    result = await run_in_threadpool(map_voltage_uc.execute, start_time, end_time, agg, node_id)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result
