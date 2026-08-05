"""Suíte E2E do Guardião — 11 cenários.

Uso:
    bash e2e/run.sh                    # roda tudo
    bash e2e/run.sh --only test_x      # apenas um teste
    bash e2e/run.sh --headed           # janela visível (debug local)

Gera `e2e/report.json` e screenshots em `/tmp/browser/guardian_e2e/screenshots/`.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Awaitable, Callable

from playwright.async_api import BrowserContext, Page, async_playwright

from lib import (
    BASE_URL,
    TestFailure,
    anon_key,
    now_marker,
    open_guardian,
    read_incidents,
    require_session,
    restore_session,
    trigger_synthetic_incident,
    wait_for_text,
)

SHOTS = Path("/tmp/browser/guardian_e2e/screenshots")
SHOTS.mkdir(parents=True, exist_ok=True)
REPORT = Path(__file__).parent / "report.json"


# ---------------------------------------------------------------------------
# 1 · Endpoint público do cron exige apikey
# ---------------------------------------------------------------------------
async def test_cron_endpoint_auth(_ctx: BrowserContext, _page: Page) -> None:
    req = urllib.request.Request(f"{BASE_URL}/api/public/guardian-cron", method="POST")
    try:
        urllib.request.urlopen(req, timeout=15)  # noqa: S310
        raise TestFailure("Cron aceitou chamada sem apikey (esperado 401).")
    except urllib.error.HTTPError as err:
        if err.code != 401:
            raise TestFailure(f"Cron respondeu {err.code}, esperado 401.") from err


# ---------------------------------------------------------------------------
# 2 · Painel carrega
# ---------------------------------------------------------------------------
async def test_panel_loads(_ctx: BrowserContext, page: Page) -> None:
    await open_guardian(page)
    await wait_for_text(page, "Analisar agora")
    await page.screenshot(path=str(SHOTS / "panel_loaded.png"))


# ---------------------------------------------------------------------------
# 3 · Botão "Analisar agora" não quebra UI
# ---------------------------------------------------------------------------
async def test_scan_button(_ctx: BrowserContext, page: Page) -> None:
    await open_guardian(page)
    btn = page.get_by_role("button", name="Analisar agora")
    await btn.wait_for(state="visible", timeout=15_000)
    await btn.click()
    await page.wait_for_timeout(3_500)
    await wait_for_text(page, "Guardião do sistema", timeout=5_000)
    await page.screenshot(path=str(SHOTS / "scan_clicked.png"))


# ---------------------------------------------------------------------------
# 4 · Toast global do listener
# ---------------------------------------------------------------------------
async def test_incident_listener_toast(_ctx: BrowserContext, page: Page) -> None:
    await open_guardian(page)
    marker = now_marker("e2e-toast")
    await trigger_synthetic_incident(page, marker)
    try:
        await page.wait_for_selector(
            "text=O Guardião detectou um problema", timeout=15_000
        )
    except Exception as err:  # noqa: BLE001
        await page.screenshot(path=str(SHOTS / "toast_missing.png"))
        raise TestFailure("Toast global não apareceu.") from err
    await page.screenshot(path=str(SHOTS / "toast_visible.png"))


# ---------------------------------------------------------------------------
# 5 · Canal Realtime é aberto pelo painel
# ---------------------------------------------------------------------------
async def test_realtime_channel_open(_ctx: BrowserContext, page: Page) -> None:
    ws_urls: list[str] = []
    page.on("websocket", lambda ws: ws_urls.append(ws.url))
    await open_guardian(page)
    for _ in range(20):
        if any("realtime" in u for u in ws_urls):
            break
        await page.wait_for_timeout(500)
    if not any("realtime" in u for u in ws_urls):
        raise TestFailure(f"Nenhum WebSocket Realtime aberto. Vistos: {ws_urls}")


# ---------------------------------------------------------------------------
# 6 · Incidente sintético persiste no painel após refresh
# ---------------------------------------------------------------------------
async def test_incident_persists_in_panel(_ctx: BrowserContext, page: Page) -> None:
    await open_guardian(page)
    marker = now_marker("e2e-persist")
    await trigger_synthetic_incident(page, marker)
    await page.wait_for_selector("text=O Guardião detectou um problema", timeout=15_000)
    # Dá tempo do server fn persistir antes do reload.
    await page.wait_for_timeout(1_500)
    await page.reload(wait_until="domcontentloaded")
    await wait_for_text(page, "Guardião do sistema")

    # Aguarda o marcador aparecer em qualquer parte da lista (até 15s).
    found = False
    for _ in range(30):
        content = await page.content()
        if marker in content:
            found = True
            break
        await page.wait_for_timeout(500)

    if not found:
        await page.screenshot(path=str(SHOTS / "persist_missing.png"))
        raise TestFailure(f"Incidente com marcador {marker} não apareceu no painel.")


# ---------------------------------------------------------------------------
# 7 · guardianListIncidents responde do cliente
# ---------------------------------------------------------------------------
async def test_list_incidents_server_fn(_ctx: BrowserContext, page: Page) -> None:
    await open_guardian(page)
    incidents = await read_incidents(page)
    if not isinstance(incidents, list):
        raise TestFailure(f"guardianListIncidents devolveu tipo inesperado: {incidents!r}")


# ---------------------------------------------------------------------------
# 8 · Reporter dedup: dois erros idênticos → um único toast/registro
# ---------------------------------------------------------------------------
async def test_reporter_dedupes(_ctx: BrowserContext, page: Page) -> None:
    await open_guardian(page)
    marker = now_marker("e2e-dedup")
    await trigger_synthetic_incident(page, marker)
    await page.wait_for_selector("text=O Guardião detectou um problema", timeout=15_000)
    await trigger_synthetic_incident(page, marker)  # mesmo fingerprint → suprimido
    await page.wait_for_timeout(3_000)
    # Nenhum segundo toast — apenas 1 elemento com o título deve existir.
    toasts = await page.locator("text=O Guardião detectou um problema").count()
    if toasts > 1:
        raise TestFailure(f"Toast duplicado após dedup: {toasts} visíveis.")


# ---------------------------------------------------------------------------
# 9 · Toast tem CTA "Analisar" que navega para /settings/audit
# ---------------------------------------------------------------------------
async def test_toast_cta_navigates(ctx: BrowserContext, page: Page) -> None:
    # Começa em rota diferente para provar a navegação.
    await page.goto(f"{BASE_URL}/inbox", wait_until="domcontentloaded")
    await page.wait_for_timeout(1_500)  # deixa o listener global montar
    marker = now_marker("e2e-cta")
    await trigger_synthetic_incident(page, marker)
    await page.wait_for_selector("text=O Guardião detectou um problema", timeout=15_000)
    await page.get_by_role("button", name="Analisar").first.click()
    await page.wait_for_url("**/settings/audit**", timeout=10_000)
    await wait_for_text(page, "Guardião do sistema")


# ---------------------------------------------------------------------------
# 10 · Endpoint cron aceita apikey válida
# ---------------------------------------------------------------------------
async def test_cron_endpoint_authorized(_ctx: BrowserContext, _page: Page) -> None:
    req = urllib.request.Request(
        f"{BASE_URL}/api/public/guardian-cron",
        method="POST",
        headers={"apikey": anon_key(), "Content-Type": "application/json"},
        data=b"{}",
    )
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:  # noqa: S310
            body = resp.read().decode("utf-8", errors="replace")
            if resp.status != 200:
                raise TestFailure(f"Cron autorizado respondeu {resp.status}: {body[:200]}")
            payload = json.loads(body)
            if not payload.get("ok"):
                raise TestFailure(f"Cron respondeu payload inesperado: {payload}")
    except urllib.error.HTTPError as err:
        raise TestFailure(f"Cron autorizado falhou: {err.code}") from err


# ---------------------------------------------------------------------------
# 11 · Sem erros críticos no console durante o painel
# ---------------------------------------------------------------------------
async def test_no_console_errors(_ctx: BrowserContext, page: Page) -> None:
    errors: list[str] = []

    def on_console(msg):
        if msg.type == "error":
            text = msg.text
            # Ignora ruídos conhecidos irrelevantes ao Guardião.
            if any(x in text for x in ("ResizeObserver", "Failed to load resource")):
                return
            errors.append(text)

    page.on("console", on_console)
    await open_guardian(page)
    await page.wait_for_timeout(4_000)
    # Erros do próprio Guardião reportando incidentes de outros testes são OK.
    unexpected = [e for e in errors if "Guardião" not in e and "guardian" not in e.lower()]
    if unexpected:
        raise TestFailure(f"Erros inesperados no console: {unexpected[:3]}")


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------
# 12 · Snapshot de saúde é gravado após scan manual
# ---------------------------------------------------------------------------
async def test_health_snapshot_recorded(_ctx: BrowserContext, page: Page) -> None:
    await open_guardian(page)
    before = await page.evaluate(
        """async () => {
          const mod = await import('/src/lib/guardian.functions.ts');
          const r = await mod.guardianListSnapshots({ data: { limit: 5 } });
          return (r.snapshots ?? []).length;
        }"""
    )
    await page.get_by_role("button", name="Analisar agora").click()
    await page.wait_for_timeout(4_000)
    after = await page.evaluate(
        """async () => {
          const mod = await import('/src/lib/guardian.functions.ts');
          const r = await mod.guardianListSnapshots({ data: { limit: 5 } });
          return (r.snapshots ?? []).length;
        }"""
    )
    if int(after) <= int(before):
        raise TestFailure(f"Snapshots não cresceram após scan (before={before}, after={after}).")


# ---------------------------------------------------------------------------
# 13 · Sparkline renderiza (SVG) quando há histórico
# ---------------------------------------------------------------------------
async def test_sparkline_renders(_ctx: BrowserContext, page: Page) -> None:
    await open_guardian(page)
    # Garante ao menos 2 pontos.
    await page.get_by_role("button", name="Analisar agora").click()
    await page.wait_for_timeout(3_500)
    await page.get_by_role("button", name="Atualizar radar").click()
    await page.wait_for_timeout(1_500)
    exists = await page.evaluate(
        """() => !!document.querySelector('[data-testid=\"guardian-sparkline\"] svg polyline')
                || !!document.querySelector('[data-testid=\"guardian-sparkline-empty\"]')"""
    )
    if not exists:
        await page.screenshot(path=str(SHOTS / "sparkline_missing.png"))
        raise TestFailure("Sparkline nem estado vazio renderizado.")


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------
Scenario = Callable[[BrowserContext, Page], Awaitable[None]]

SCENARIOS: list[tuple[str, Scenario, bool]] = [
    ("test_cron_endpoint_auth", test_cron_endpoint_auth, False),
    ("test_panel_loads", test_panel_loads, True),
    ("test_scan_button", test_scan_button, True),
    ("test_incident_listener_toast", test_incident_listener_toast, True),
    ("test_realtime_channel_open", test_realtime_channel_open, True),
    ("test_incident_persists_in_panel", test_incident_persists_in_panel, True),
    ("test_list_incidents_server_fn", test_list_incidents_server_fn, True),
    ("test_reporter_dedupes", test_reporter_dedupes, True),
    ("test_toast_cta_navigates", test_toast_cta_navigates, True),
    ("test_cron_endpoint_authorized", test_cron_endpoint_authorized, False),
    ("test_no_console_errors", test_no_console_errors, True),
    ("test_health_snapshot_recorded", test_health_snapshot_recorded, True),
    ("test_sparkline_renders", test_sparkline_renders, True),
]



async def run_one(
    pw, name: str, fn: Scenario, needs_auth: bool, headed: bool
) -> tuple[str, str, float, str | None]:
    started = time.time()
    browser = await pw.chromium.launch(headless=not headed)
    try:
        context = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await context.new_page()
        if needs_auth:
            await restore_session(context, page)
        await fn(context, page)
        return name, "PASS", time.time() - started, None
    except Exception as err:  # noqa: BLE001
        try:
            pages = context.pages if "context" in locals() else []
            for i, pg in enumerate(pages):
                await pg.screenshot(path=str(SHOTS / f"{name}_fail_{i}.png"))
        except Exception:  # noqa: BLE001
            pass
        return name, "FAIL", time.time() - started, str(err)
    finally:
        await browser.close()


async def main(only: str | None, headed: bool, keep_going: bool) -> int:
    from lib import AUTH_STATUS

    has_session = AUTH_STATUS == "injected"
    if not has_session:
        print(f"⚠ Sessão Supabase indisponível (status={AUTH_STATUS}). "
              "Cenários autenticados serão marcados como SKIP.")

    scenarios = SCENARIOS if not only else [s for s in SCENARIOS if s[0] == only]
    if only and not scenarios:
        print(f"❌ Cenário desconhecido: {only}")
        print("Disponíveis:", ", ".join(s[0] for s in SCENARIOS))
        return 2

    results: list[dict] = []
    exit_code = 0

    async with async_playwright() as pw:
        for name, fn, needs_auth in scenarios:
            print(f"  · {name} …", flush=True)
            if needs_auth and not has_session:
                results.append(
                    {"name": name, "status": "SKIP", "duration_ms": 0,
                     "error": "sessão indisponível"}
                )
                print("    ⚠ SKIP (sem sessão)")
                continue
            n, status, dur, err = await run_one(pw, name, fn, needs_auth, headed)
            results.append(
                {"name": n, "status": status, "duration_ms": round(dur * 1000), "error": err}
            )
            symbol = "✓" if status == "PASS" else "✗"
            extra = "" if status == "PASS" else f" — {err}"
            print(f"    {symbol} {status} ({dur:.1f}s){extra}")
            if status != "PASS":
                exit_code = 1
                if not keep_going:
                    break

    REPORT.write_text(json.dumps({"results": results}, indent=2, ensure_ascii=False))
    print("\n=== Relatório final ===")
    for r in results:
        print(f"  [{r['status']}] {r['name']} — {r['duration_ms']}ms")
    print(f"\nRelatório: {REPORT}")
    print(f"Screenshots: {SHOTS}")
    return exit_code


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", help="Roda apenas um cenário")
    parser.add_argument("--headed", action="store_true", help="Janela visível (debug)")
    parser.add_argument("--keep-going", action="store_true", help="Continua após falha")
    args = parser.parse_args()
    sys.exit(asyncio.run(main(args.only, args.headed, args.keep_going)))
