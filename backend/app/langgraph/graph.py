from functools import lru_cache

from langgraph.graph import END, StateGraph

from app.langgraph.nodes import (
    deterministic_scan,
    llm_analysis,
    report_generation,
    risk_scoring,
)
from app.langgraph.state import EvaluationState


def build_evaluation_graph() -> StateGraph:
    graph = StateGraph(EvaluationState)

    # Phase 1: deterministic scanners
    graph.add_node("deterministic_scan", deterministic_scan)

    # Phase 2: LLM interpretation + scoring + report
    graph.add_node("llm_analysis", llm_analysis)
    graph.add_node("risk_scoring", risk_scoring)
    graph.add_node("report_generation", report_generation)

    graph.set_entry_point("deterministic_scan")
    graph.add_edge("deterministic_scan", "llm_analysis")
    graph.add_edge("llm_analysis", "risk_scoring")
    graph.add_edge("risk_scoring", "report_generation")
    graph.add_edge("report_generation", END)

    return graph


@lru_cache(maxsize=1)
def get_evaluation_workflow():
    return build_evaluation_graph().compile()
