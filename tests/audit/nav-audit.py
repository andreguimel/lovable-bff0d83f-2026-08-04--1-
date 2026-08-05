import asyncio, json, os, sys
from pathlib import Path
from playwright.async_api import async_playwright

OUT = Path("/tmp/browser/audit"); OUT.mkdir(parents=True, exist_ok=True)
routes = json.loads(Path("docs/audits/master-audit/evidence/routes.json").read_text())

# filter public/authenticated pages, skip api/dynamic
def to_url(r):
    if r.startswith("/api/") or "$" in r: return None
    p = r.replace("/_authenticated", "") or "/"
    if p.startswith("/api"): return None
    return p

urls = sorted({to_url(r) for r in routes if to_url(r) is not None})

async def main():
    results = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1440, "height": 900})
        page = await ctx.new_page()

        cookies_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON")
        if cookies_json:
            cookies = json.loads(cookies_json)
            for c in cookies: c["url"] = "http://localhost:8080"
            await ctx.add_cookies(cookies)

        await page.goto("http://localhost:8080", wait_until="domcontentloaded")
        storage_key = os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY")
        session_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON")
        if storage_key and session_json:
            await page.evaluate(f"window.localStorage.setItem({json.dumps(storage_key)}, {json.dumps(session_json)})")

        for url in urls:
            errs = []
            def on_console(msg):
                if msg.type in ("error", "warning"): errs.append(f"[{msg.type}] {msg.text[:200]}")
            def on_pagerr(exc): errs.append(f"[pageerror] {str(exc)[:200]}")
            page.on("console", on_console)
            page.on("pageerror", on_pagerr)
            failed = []
            def on_resp(r):
                if r.status >= 400: failed.append(f"{r.status} {r.url[:120]}")
            page.on("response", on_resp)

            t0 = None
            try:
                resp = await page.goto(f"http://localhost:8080{url}", wait_until="load", timeout=15000)
                # Wait for Supabase/serverFn in-flight requests to settle before capturing console.
                # Without this, cross-navigation aborts surface as spurious "TypeError: Failed to fetch".
                try:
                    await page.wait_for_load_state("networkidle", timeout=8000)
                except Exception:
                    pass
                await page.wait_for_timeout(500)
                title = await page.title()
                slug = url.replace("/", "_") or "_root"
                shot = OUT / f"{slug}.png"
                await page.screenshot(path=str(shot))
                perf = await page.evaluate("() => { const n = performance.getEntriesByType('navigation')[0]; return n ? { dom: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd) } : null; }")
                # Filter environment-artifact errors caused by cross-navigation request abortion.
                filtered = [c for c in errs if "Failed to fetch" not in c]
                results.append({"url": url, "status": resp.status if resp else None, "title": title, "perf": perf, "console": filtered[:20], "console_env_artifacts": len(errs) - len(filtered), "failed_requests": failed[:10], "screenshot": str(shot)})
            except Exception as e:
                results.append({"url": url, "error": str(e)[:300], "console": errs[:20], "failed_requests": failed[:10]})
            finally:
                page.remove_listener("console", on_console)
                page.remove_listener("pageerror", on_pagerr)
                page.remove_listener("response", on_resp)

        await browser.close()
    Path("docs/audits/master-audit/evidence/nav-results.json").write_text(json.dumps(results, indent=2))
    print(f"visited {len(results)} routes")

asyncio.run(main())
