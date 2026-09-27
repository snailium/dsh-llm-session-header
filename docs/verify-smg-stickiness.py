#!/usr/bin/env python3
"""Confirm the corrected verification method on the live SMG gateway.

Sends the same routing key repeatedly and reports the worker SMG chose each time.
One distinct worker across repeats == sticky assignment == the key was received.

Run before and after a config change to show the change is behaviour-preserving.
"""
import json
import urllib.request

BASE = "http://<gateway-host>:<port>"
MODEL = "/models/Qwen3.8-27B-Q4_K_M.gguf"
REPEATS = 5


def send(key):
    payload = json.dumps({
        "model": MODEL,
        "messages": [{"role": "user", "content": "hi"}],
        "max_tokens": 4,
        "stream": False,
    }).encode()
    req = urllib.request.Request(BASE + "/v1/chat/completions", data=payload, method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("Authorization", "Bearer dummy")
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


print("sticky assignment by routing key (corrected check):")
results = [check("verify-key-1"), check("verify-key-2")]
print()
print("PASS: every key pinned to one worker" if all(results)
      else "FAIL: at least one key moved between workers")
