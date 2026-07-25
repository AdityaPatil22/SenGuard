from functools import lru_cache

from langgraph.graph import END, StateGraph

from app.langgraph.nodes import (
    dataset_validation,
    model_evaluation,
    prompt_security,
    report_generation,
    risk_scoring,
)
from app.langgraph.state import EvaluationState


def build_evaluation_graph() -> StateGraph:
    graph = StateGraph(EvaluationState)

    graph.add_node("prompt_security", prompt_security)
    graph.add_node("dataset_validation", dataset_validation)
    graph.add_node("model_evaluation", model_evaluation)
    graph.add_node("risk_scoring", risk_scoring)
    graph.add_node("report_generation", report_generation)

    graph.set_entry_point("prompt_security")
    graph.add_edge("prompt_security", "dataset_validation")
    graph.add_edge("dataset_validation", "model_evaluation")
    graph.add_edge("model_evaluation", "risk_scoring")
    graph.add_edge("risk_scoring", "report_generation")
    graph.add_edge("report_generation", END)

    return graph


@lru_cache(maxsize=1)
def get_evaluation_workflow():
    return build_evaluation_graph().compile()
