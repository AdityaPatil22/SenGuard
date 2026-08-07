import asyncio
from datetime import datetime, timezone
from typing import AsyncGenerator

class EvaluationProgress:
    def __init__(self):
        self._events: list[dict] = []
        self._done = asyncio.Event()
        self._waiters: list[asyncio.Event] = []

    def _emit(self, event: dict):
        event["timestamp"] = datetime.now(timezone.utc).isoformat()
        self._events.append(event)
        for waiter in self._waiters:
            waiter.set()

    def start_node(self, name: str):
        self._emit({"type": "node:start", "node": name})

    def complete_node(self, name: str):
        self._emit({"type": "node:complete", "node": name})

    def fail_node(self, name: str, error: str):
        self._emit({"type": "node:failed", "node": name, "error": error})

    def complete(self):
        self._emit({"type": "evaluation:complete"})
        self._done.set()

    def fail(self, error: str):
        self._emit({"type": "evaluation:failed", "error": error})
        self._done.set()

    async def stream(self) -> AsyncGenerator[dict, None]:
        index = 0
        keepalive_interval = 30
        last_keepalive = asyncio.get_running_loop().time()

        while True:
            while index < len(self._events):
                yield self._events[index]
                index += 1

            if self._done.is_set():
                break

            waiter = asyncio.Event()
            self._waiters.append(waiter)

            try:
                await asyncio.wait_for(waiter.wait(), timeout=keepalive_interval)
            except asyncio.TimeoutError:
                now = asyncio.get_running_loop().time()
                if now - last_keepalive >= keepalive_interval:
                    yield {"type": "keepalive", "timestamp": datetime.now(timezone.utc).isoformat()}
                    last_keepalive = now
            finally:
                self._waiters.remove(waiter)


progress_store: dict[str, EvaluationProgress] = {}
