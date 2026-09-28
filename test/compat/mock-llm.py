#!/usr/bin/env python3
"""Minimal OpenAI-compatible mock LLM server for isolated dsh boots.

Serves GET /v1/models and POST /v1/chat/completions (streaming + non-streaming)
on 127.0.0.1:<port>. The port is the first CLI argument (default 8901).

It records every request header it sees into a global list, exposed at
GET /_headers — handy for verifying that session-header injection reached the
wire without scraping logs.
"""
import json
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8901

SEEN_HEADERS: list[dict] = []
LOCK = threading.Lock()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):  # keep the mock quiet
        pass

    def _send_json(self, code, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/v1/models":
            self._send_json(200, {
                "object": "list",
                "data": [{
                    "id": "mock-model",
                    "object": "model",
                    "owned_by": "dsh-isolated-preview",
                }],
            })
        elif self.path == "/_headers":
            with LOCK:
                snapshot = list(SEEN_HEADERS)
            self._send_json(200, {"requests": snapshot})
        else:
            self._send_json(404, {"error": "not found"})

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length) if length else b"{}"
        with LOCK:
            SEEN_HEADERS.append({
                "path": self.path,
                "headers": {k: v for k, v in self.headers.items()},
            })
        if self.path == "/v1/chat/completions":
            try:
                req = json.loads(raw or b"{}")
            except json.JSONDecodeError:
                req = {}
            stream = bool(req.get("stream"))
            if stream:
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
                self.end_headers()
                for i, chunk in enumerate(["mock", " model", ": ok"]):
                    payload = {
                        "id": "chatcmpl-mock",
                        "object": "chat.completion.chunk",
                        "choices": [{
                            "index": 0,
                            "delta": {"content": chunk} if i else {},
                            "finish_reason": None,
                        }],
                    }
                    self.wfile.write(f"data: {json.dumps(payload)}\n\n".encode("utf-8"))
                done = {
                    "id": "chatcmpl-mock",
                    "object": "chat.completion.chunk",
                    "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
                }
                self.wfile.write(f"data: {json.dumps(done)}\n\n".encode("utf-8"))
                self.wfile.write(b"data: [DONE]\n\n")
            else:
                self._send_json(200, {
                    "id": "chatcmpl-mock",
                    "object": "chat.completion",
                    "model": req.get("model", "mock-model"),
                    "choices": [{
                        "index": 0,
                        "message": {"role": "assistant", "content": "mock model: ok"},
                        "finish_reason": "stop",
                    }],
                    "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2},
                })
        else:
            self._send_json(404, {"error": "not found"})


def main():
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"mock-llm listening on 127.0.0.1:{PORT}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
