#!/usr/bin/env python3
"""SARVIS local model bridge.

A tiny stdin/stdout JSON-RPC worker the Node backend spawns when the user
chooses an offline model. Each request is one JSON object per line:

    {"id": 1, "messages": [...], "system": "..."}

…and the reply is one JSON object per line:

    {"id": 1, "reply": "Hello..."}      // on success
    {"id": 1, "error": "no model"}      // on failure

The script tries adapters in this order:
  1. Ollama HTTP API at OLLAMA_HOST (default http://127.0.0.1:11434).
     Use OLLAMA_MODEL env var to pick the model (default "llama3.2").
  2. llama-cpp-python with a GGUF file at SARVIS_GGUF_PATH.
  3. transformers pipeline with SARVIS_HF_MODEL (e.g. "microsoft/Phi-3-mini-4k-instruct").

Anything missing → reply with a clear error so the UI can fall back to online.

Tested on python 3.10+. No third-party deps required for the Ollama path.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.request
import urllib.error
from typing import Any


OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434").rstrip("/")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama3.2")
GGUF_PATH = os.environ.get("SARVIS_GGUF_PATH", "")
HF_MODEL = os.environ.get("SARVIS_HF_MODEL", "")

# Per-model defaults: ctx window + max new tokens. Tuned for speed/quality
# balance on a typical laptop. Override via env if you have more VRAM.
NUM_CTX = int(os.environ.get("SARVIS_NUM_CTX", "8192"))
NUM_PREDICT = int(os.environ.get("SARVIS_NUM_PREDICT", "1024"))
TEMPERATURE = float(os.environ.get("SARVIS_TEMPERATURE", "0.7"))
TOP_P = float(os.environ.get("SARVIS_TOP_P", "0.9"))


# ---- Adapters ------------------------------------------------------------

def _try_ollama(messages: list[dict[str, str]], system: str | None) -> str | None:
    """Returns text on success, None if Ollama is unreachable."""
    payload: dict[str, Any] = {
        "model": OLLAMA_MODEL,
        "messages": ([{"role": "system", "content": system}] if system else [])
        + messages,
        "stream": False,
        "options": {
            "temperature": TEMPERATURE,
            "top_p": TOP_P,
            "num_ctx": NUM_CTX,
            "num_predict": NUM_PREDICT,
        },
    }
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{OLLAMA_HOST}/api/chat",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return (data.get("message") or {}).get("content") or ""
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError):
        return None


_LLAMA = None  # lazy-loaded llama_cpp.Llama instance
def _try_llama_cpp(messages: list[dict[str, str]], system: str | None) -> str | None:
    global _LLAMA
    if not GGUF_PATH or not os.path.isfile(GGUF_PATH):
        return None
    try:
        if _LLAMA is None:
            from llama_cpp import Llama  # type: ignore

            _LLAMA = Llama(
                model_path=GGUF_PATH,
                n_ctx=NUM_CTX,
                n_threads=os.cpu_count() or 4,
                verbose=False,
            )
        full_messages = ([{"role": "system", "content": system}] if system else []) + messages
        out = _LLAMA.create_chat_completion(
            messages=full_messages,
            max_tokens=NUM_PREDICT,
            temperature=TEMPERATURE,
            top_p=TOP_P,
        )  # type: ignore
        return out["choices"][0]["message"]["content"]
    except Exception:
        return None


_HF_PIPE = None
def _try_transformers(messages: list[dict[str, str]], system: str | None) -> str | None:
    global _HF_PIPE
    if not HF_MODEL:
        return None
    try:
        if _HF_PIPE is None:
            from transformers import pipeline  # type: ignore

            _HF_PIPE = pipeline("text-generation", model=HF_MODEL, device_map="auto")
        prompt_parts = []
        if system:
            prompt_parts.append(f"<|system|>\n{system}\n")
        for m in messages:
            prompt_parts.append(f"<|{m['role']}|>\n{m['content']}\n")
        prompt_parts.append("<|assistant|>\n")
        prompt = "".join(prompt_parts)
        out = _HF_PIPE(
            prompt,
            max_new_tokens=NUM_PREDICT,
            do_sample=True,
            temperature=TEMPERATURE,
            top_p=TOP_P,
        )  # type: ignore
        text = out[0]["generated_text"][len(prompt) :]
        return text.strip()
    except Exception:
        return None


# ---- Dispatcher ----------------------------------------------------------

ADAPTERS = [
    ("ollama", _try_ollama),
    ("llama.cpp", _try_llama_cpp),
    ("transformers", _try_transformers),
]


def handle(req: dict[str, Any]) -> dict[str, Any]:
    rid = req.get("id")
    messages = req.get("messages") or []
    system = req.get("system")
    if not isinstance(messages, list) or not all(isinstance(m, dict) for m in messages):
        return {"id": rid, "error": "invalid 'messages' field"}

    tried: list[str] = []
    for name, fn in ADAPTERS:
        tried.append(name)
        result = fn(messages, system)
        if result is not None and result.strip():
            return {"id": rid, "reply": result, "adapter": name}

    return {
        "id": rid,
        "error": (
            "No local model available. Install Ollama (https://ollama.com) and run "
            f"'ollama pull {OLLAMA_MODEL}', or set SARVIS_GGUF_PATH to a GGUF file, "
            "or set SARVIS_HF_MODEL to a Hugging Face model id."
        ),
        "tried": tried,
    }


def main() -> None:
    # First line on startup: a status banner so the parent can detect readiness.
    sys.stdout.write(json.dumps({
        "ready": True,
        "ollama_host": OLLAMA_HOST,
        "ollama_model": OLLAMA_MODEL,
        "num_ctx": NUM_CTX,
        "num_predict": NUM_PREDICT,
    }) + "\n")
    sys.stdout.flush()
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError as e:
            sys.stdout.write(json.dumps({"error": f"invalid json: {e}"}) + "\n")
            sys.stdout.flush()
            continue
        try:
            resp = handle(req)
        except Exception as e:  # pragma: no cover — defensive
            resp = {"id": req.get("id"), "error": f"unhandled: {e!r}"}
        sys.stdout.write(json.dumps(resp) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
