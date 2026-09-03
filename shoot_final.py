"""Finale Screenshots: Viewport-Aufnahmen (kein Full-Page-Artefakt)."""
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1720, "height": 1000})
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto("http://localhost:8123/index.html")
    page.evaluate("localStorage.clear()")
    page.reload()
    page.wait_for_selector(".kpis")
    page.wait_for_timeout(300)

    # Dashboard dunkel: oben + gescrollt (Sticky-Grid sichtbar)
    page.screenshot(path="/tmp/f_dash_top.png")
    page.mouse.wheel(0, 500)
    page.wait_for_timeout(250)
    page.screenshot(path="/tmp/f_dash_scrolled.png")
    page.mouse.wheel(0, -500)

    # Zeiträume-Modal (Viewport, offen)
    page.click("button[data-tab='touren']")
    page.wait_for_selector(".fahrplan-banner")
    page.click("#saison-edit")
    page.wait_for_selector("#pe-list")
    page.wait_for_timeout(200)
    page.screenshot(path="/tmp/f_modal.png")
    page.keyboard.press("Escape")
    page.wait_for_timeout(200)

    # Touren dunkel + hell
    page.screenshot(path="/tmp/f_touren.png")
    page.click("#themeswitch button[data-th='light']")
    page.wait_for_timeout(150)
    page.screenshot(path="/tmp/f_touren_light.png")

    # Dashboard hell: oben + gescrollt
    page.click("button[data-tab='dashboard']")
    page.wait_for_selector(".kpis")
    page.screenshot(path="/tmp/f_dash_light.png")
    page.mouse.wheel(0, 500)
    page.wait_for_timeout(250)
    page.screenshot(path="/tmp/f_dash_light_scrolled.png")

    print("errors:", errors or "keine")
    b.close()
