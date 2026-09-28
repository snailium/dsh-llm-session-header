#!/usr/bin/env python3
"""Confirm the corrected verification method on a live SMG gateway.

Sends the same routing key repeatedly and reports the worker SMG chose each time.
One distinct worker across repeats == sticky assignment == the key was received.

Usage:
    verify-smg-stickiness.py <gateway-base-url> [model] [repeats]

Example:
    verify-smg-stickiness.py http://127.0.0.1:40114
    verify-smg-stickiness.py http://gateway.internal:40114 /models/my-model.gguf 5

Run before and after a config change to show the change is behaviour-preserving.
"""
import json
import sys
import urllib.request

if len(sys.argv) < 2:
    print(__doc__.strip())
    sys.exit(2)

BASE = sys.argv[1].rstrip("/")
MODEL = sys.argv[2] if len(sys.argv) > 2 else "/models/Qwen3.8-27B-Q4_K_M.gguf"
REPEATS = int(sys.argv[3]) if len(sys.argv) > 3 else 5


def send(key):
    payload = json.dumps({
        "model": MODEL,
        "messages": [{"role": "user", "content": "hi"}],
        "max_tokens": 4,
        "stream": False,
    }).encode()
    req = urllib.request.Request(BASE + "/v1/chat/completions", data=payload, method="POST")
    req.add_header("Content-Type", "application/json")
    # The routing key is the thing under test; the gateway is not expected to
    # authenticate here, so send a placeholder.
    req.add_header("Authorization", "Bearer placeholder")
    req.add_header("X-SMG-Routing-Key", key)
    with urllib.request.urlopen(req, timeout=120) as r:
        routed = r.getheader("x-smg-routed-worker-id")
        r.read()
        return routed.rsplit(":", 1)[-1] if routed else None


def check(key):
    hits = [send(key) for _ in range(REPEATS)]
    distinct = sorted(set(hits))
    ok = len(distinct) == 1
    print("  %-16s -> %s   distinct=%s  %s"
          % (key, hits, distinct, "STICKY" if ok else "NOT STICKY"))
    return ok


print("gateway: %s   model: %s   repeats: %d" % (BASE, MODEL, REPEATS))
print("sticky assignment by routing key (corrected check):")
results = [check("verify-key-1"), check("verify-key-2")]
print()
print("PASS: every key pinned to one worker" if all(results)
      else "FAIL: at least one key moved between workers")
sys.exit(0 if all(results) else 1)
