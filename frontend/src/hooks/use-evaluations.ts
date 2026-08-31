import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, useCallback } from "react";

import api from "@/services/api";
import { getEvaluations, getEvaluation, createEvaluation, runEvaluation } from "@/services/evaluations";
import type { CreateEvaluationRequest } from "@/types/api";
import type { NodeStatus } from "@/components/pipeline-stepper";

export function useEvaluations() {
  return useQuery({
    queryKey: ["evaluations"],
    queryFn: getEvaluations,
  });
}

export function useEvaluation(id: string | undefined) {
  return useQuery({
    queryKey: ["evaluations", id],
    queryFn: () => getEvaluation(id!),
    enabled: !!id,
  });
}

export function useCreateEvaluation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateEvaluationRequest) => createEvaluation(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["evaluations"] }),
  });
}

export function useRunEvaluation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => runEvaluation(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["evaluations"] });
    },
  });
}

export function useEvaluationStream(evaluationId: string | undefined, enabled: boolean) {
  const [state, setState] = useState<{ nodes: Record<string, NodeStatus>; isDone: boolean }>({
    nodes: {},
    isDone: false,
  });
  const qc = useQueryClient();
  const esRef = useRef<EventSource | null>(null);

  const invalidateQueries = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["evaluations"] });
    qc.invalidateQueries({ queryKey: ["reports"] });
  }, [qc]);

  useEffect(() => {
    if (enabled) {
      setState({ nodes: {}, isDone: false });
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !evaluationId || state.isDone) return;

    let es: EventSource | null = null;
    let cancelled = false;

    (async () => {
      // Exchange the JWT (via auth header) for a short-lived single-use ticket so the
      // token never appears in the EventSource URL / server logs.
      const { data } = await api.post(`/evaluations/${evaluationId}/stream-ticket`);
      const ticket = data.data.ticket;
      if (cancelled) return;

      const baseUrl = import.meta.env.VITE_API_URL || "/api/v1";
      es = new EventSource(`${baseUrl}/evaluations/${evaluationId}/stream?ticket=${ticket}`);
      esRef.current = es;

      es.onmessage = (e) => {
        const event = JSON.parse(e.data);

        if (event.type === "node:start") {
          setState((prev) => ({ ...prev, nodes: { ...prev.nodes, [event.node]: "running" } }));
        } else if (event.type === "node:complete") {
          setState((prev) => ({ ...prev, nodes: { ...prev.nodes, [event.node]: "completed" } }));
        } else if (event.type === "node:failed") {
          setState((prev) => ({ ...prev, nodes: { ...prev.nodes, [event.node]: "failed" } }));
        } else if (event.type === "evaluation:complete" || event.type === "evaluation:failed") {
          setState((prev) => ({ ...prev, isDone: true }));
          invalidateQueries();
          es?.close();
        }
      };

      es.onerror = () => {
        invalidateQueries();
        es?.close();
      };
    })();

    return () => {
      cancelled = true;
      es?.close();
    };
  }, [evaluationId, enabled, state.isDone, invalidateQueries]);

  return { nodes: state.nodes, isDone: state.isDone };
}
