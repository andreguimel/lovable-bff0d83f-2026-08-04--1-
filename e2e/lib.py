"""Helpers compartilhados pela suíte E2E do Guardião."""

from __future__ import annotations

import json
import os
import time
from typing import Any

from playwright.async_api import BrowserContext, Page

BASE_URL = "http://localhost:8080"

STORAGE_KEY = os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY")
SESSION_JSON = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON")
COOKIES_JSON = os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON")
AUTH_STATUS = os.environ.get("LOVABLE_BROWSER_AUTH_STATUS", "unknown")


class TestFailure(AssertionError):
    """Falha dedicada de asserção do E2E."""


def require_session() -> None:
    if AUTH_STATUS != "injected" or not STORAGE_KEY or not SESSION_JSON:
        raise TestFailure(
            f"Sessão Supabase indisponível (status={AUTH_STATUS}). "
            "Faça login no preview e reexecute a suíte."
        )


async def restore_session(context: BrowserContext, page: Page) -> None:
    """Restaura sessão Supabase (cookies + localStorage) antes de navegar."""
    if COOKIES_JSON:
        cookies = json.loads(COOKIES_JSON)
        for c in cookies:
            c["url"] = BASE_URL
        await context.add_cookies(cookies)

    await page.goto(BASE_URL, wait_until="domcontentloaded")
    if STORAGE_KEY and SESSION_JSON:
        await page.evaluate(
            f"window.localStorage.setItem({json.dumps(STORAGE_KEY)},"
            f" {json.dumps(SESSION_JSON)})"
        )


async def open_guardian(page: Page) -> None:
    """Abre o painel do Guardião e aguarda o cabeçalho."""
    await page.goto(f"{BASE_URL}/settings/audit", wait_until="domcontentloaded")
    await page.wait_for_selector("text=Guardião do sistema", timeout=20_000)


async def wait_for_text(page: Page, text: str, timeout: int = 15_000) -> None:
    await page.wait_for_selector(f"text={text}", timeout=timeout)


async def trigger_synthetic_incident(page: Page, marker: str) -> None:
    """Dispara um Error assíncrono para acionar o reporter global."""
    await page.evaluate(
        f"setTimeout(() => {{ throw new Error({json.dumps(marker)}); }}, 20);"
    )


async def read_incidents(page: Page) -> list[dict[str, Any]]:
    """Chama guardianListIncidents via fetch client-side. Requer sessão ativa."""
    result = await page.evaluate(
        """async () => {
          const mod = await import('/src/lib/guardian.functions.ts');
          const res = await mod.guardianListIncidents({ data: { status: 'all' } });
          return res.incidents ?? [];
        }"""
    )
    return result or []


def anon_key() -> str:
    """Anon/publishable key usada pelo endpoint público de cron."""
    # Chave publishable do projeto — mesma que o endpoint aceita como apikey.
    return (
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
        "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pYW1jcHV2cmFmaWhnbXdyaW9sIiwicm9sZS"
        "I6ImFub24iLCJpYXQiOjE3ODM5NzA5MjYsImV4cCI6MjA5OTU0NjkyNn0."
        "c89rf_BHBeG6I6PUOX3QHd28JWq7iGrRgz4PSzfpckM"
    )


def now_marker(prefix: str) -> str:
    return f"{prefix}-{int(time.time() * 1000)}"
