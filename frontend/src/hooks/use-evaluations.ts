import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, useCallback } from "react";

import { getEvaluations, createEvaluation, runEvaluation } from "@/services/evaluations";
import type { CreateEvaluationRequest } from "@/types/api";
import type { NodeStatus } from "@/components/pipeline-stepper";

export function useEvaluations() {
  return useQuery({
    queryKey: ["evaluations"],
    queryFn: getEvaluations,
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
  return useMutation({
    mutationFn: (id: string) => runEvaluation(id),
  });
}

export function useEvaluationStream(evaluationId: string | undefined, enabled: boolean) {
  const [nodes, setNodes] = useState<Record<string, NodeStatus>>({});
  const [isDone, setIsDone] = useState(false);
  const qc = useQueryClient();
  const esRef = useRef<EventSource | null>(null);

  const invalidateQueries = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["evaluations"] });
    qc.invalidateQueries({ queryKey: ["reports"] });
  }, [qc]);

  useEffect(() => {
    if (!enabled || !evaluationId || isDone) return;

    const token = localStorage.getItem("access_token");
    if (!token) return;

    const baseUrl = import.meta.env.VITE_API_URL || "/api/v1";
    const url = `${baseUrl}/evaluations/${evaluationId}/stream?token=${token}`;

    const es = new EventSource(url);
    esRef.current = es;

    es.onmessage = (e) => {
      const event = JSON.parse(e.data);

      if (event.type === "node:start") {
        setNodes((prev) => ({ ...prev, [event.node]: "running" }));
      } else if (event.type === "node:complete") {
        setNodes((prev) => ({ ...prev, [event.node]: "completed" }));
      } else if (event.type === "node:failed") {
        setNodes((prev) => ({ ...prev, [event.node]: "failed" }));
      } else if (event.type === "evaluation:complete" || event.type === "evaluation:failed") {
        setIsDone(true);
        invalidateQueries();
        es.close();
      }
    };

    es.onerror = () => {
      invalidateQueries();
      es.close();
    };

    return () => {
      es.close();
    };
  }, [evaluationId, enabled, isDone, invalidateQueries]);

  return { nodes, isDone };
}
