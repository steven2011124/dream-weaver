"""Unified LLM client. Both providers expose the same .complete() interface
so the rest of the codebase never branches on provider.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from tenacity import retry, stop_after_attempt, wait_exponential

from agent.config import LLMConfig

logger = logging.getLogger(__name__)


@dataclass
class LLMResponse:
    text: str
    provider: str
    model: str
    input_tokens: int = 0
    output_tokens: int = 0


class LLMError(RuntimeError):
    pass


class LLMClient:
    """Provider-agnostic chat-completion client.

    Usage:
        client = LLMClient(config.llm)
        resp = client.complete(system="...", user="...")
    """

    def __init__(self, llm_config: LLMConfig):
        self.config = llm_config
        self._anthropic = None
        self._openai = None

        if llm_config.anthropic_api_key:
            import anthropic

            self._anthropic = anthropic.Anthropic(api_key=llm_config.anthropic_api_key)

        if llm_config.openai_api_key:
            import openai

            self._openai = openai.OpenAI(api_key=llm_config.openai_api_key)

    def _provider_order(self) -> list[str]:
        if self.config.provider == "anthropic":
            return ["anthropic"]
        if self.config.provider == "openai":
            return ["openai"]
        # auto: prefer anthropic, fall back to openai
        order = []
        if self._anthropic:
            order.append("anthropic")
        if self._openai:
            order.append("openai")
        return order

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=2, min=2, max=30))
    def complete(self, system: str, user: str, max_tokens: int | None = None) -> LLMResponse:
        last_error: Exception | None = None
        for provider in self._provider_order():
            try:
                if provider == "anthropic":
                    return self._complete_anthropic(system, user, max_tokens)
                else:
                    return self._complete_openai(system, user, max_tokens)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Provider %s failed: %s", provider, exc)
                last_error = exc
                continue
        raise LLMError(f"All LLM providers failed. Last error: {last_error}")

    def _complete_anthropic(self, system: str, user: str, max_tokens: int | None) -> LLMResponse:
        assert self._anthropic is not None
        resp = self._anthropic.messages.create(
            model=self.config.anthropic_model,
            max_tokens=max_tokens or self.config.max_tokens,
            temperature=self.config.temperature,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        text = "".join(block.text for block in resp.content if block.type == "text")
        return LLMResponse(
            text=text,
            provider="anthropic",
            model=self.config.anthropic_model,
            input_tokens=resp.usage.input_tokens,
            output_tokens=resp.usage.output_tokens,
        )

    def _complete_openai(self, system: str, user: str, max_tokens: int | None) -> LLMResponse:
        assert self._openai is not None
        resp = self._openai.chat.completions.create(
            model=self.config.openai_model,
            max_tokens=max_tokens or self.config.max_tokens,
            temperature=self.config.temperature,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        )
        text = resp.choices[0].message.content or ""
        usage = resp.usage
        return LLMResponse(
            text=text,
            provider="openai",
            model=self.config.openai_model,
            input_tokens=getattr(usage, "prompt_tokens", 0) or 0,
            output_tokens=getattr(usage, "completion_tokens", 0) or 0,
        )
