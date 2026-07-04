#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Consulta Amigable MEF -> serie histórica pliego 524 (U.N. FEDERICO VILLARREAL).
Drill: Año -> Nivel de Gobierno -> E: GOBIERNO NACIONAL -> Sector 10 EDUCACION -> Pliego 524.
Parsea PIA/PIM/Certificado/Comprometido/Devengado/Girado de la fila 524.
Guarda raw en ca_villarreal_raw.json. El merge lo hace merge_presupuesto.py.
Adaptado de scraper_ca_villarreal.py (pliego 510 San Marcos) -> UNFV.
"""
import requests, re, json, os, time, sys
from bs4 import BeautifulSoup

BASE = "https://apps5.mineco.gob.pe/transparencia/Navegador/"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
HERE = os.path.dirname(os.path.abspath(__file__))
PLIEGO = "524"


def new_session():
    s = requests.Session()
    s.headers.update({"User-Agent": UA})
    s.get(BASE + "default.aspx", timeout=40)
    return s


def fields(soup):
    d = {}
    for inp in soup.select("input"):
        n = inp.get("name"); t = (inp.get("type") or "text").lower()
        if not n or t in ("submit", "button", "image", "reset"):
            continue
        if t in ("radio", "checkbox"):
            if inp.has_attr("checked"):
                d[n] = inp.get("value", "on")
        else:
            d[n] = inp.get("value", "")
    for sel in soup.select("select"):
        n = sel.get("name")
        if n:
            o = sel.select_one("option[selected]") or sel.select_one("option")
            d[n] = o.get("value", "") if o else ""
    return d


def rows_with_grp1(soup):
    out = []
    for tr in soup.find_all("tr"):
        radio = tr.find("input", {"name": "grp1"})
        if not radio:
            continue
        lbl = None
        for td in tr.find_all("td"):
            t = td.get_text(" ", strip=True)
            if re.match(r"^[\wÑ]+:\s", t):
                lbl = t; break
        out.append((lbl, radio.get("value")))
    return out


def num(s):
    s = (s or "").replace(",", "").strip()
    try:
        return round(float(s), 2)
    except ValueError:
        return None


def parse_target_row(soup, code):
    pat = re.compile(r"^0*%s\s*:" % re.escape(code))
    for tr in soup.find_all("tr"):
        cells = [td.get_text(" ", strip=True) for td in tr.find_all("td")]
        idx = next((i for i, c in enumerate(cells) if pat.match(c)), None)
        if idx is None:
            continue
        nums = [num(c) for c in cells[idx + 1:]
                if re.match(r"^-?[\d,]+(\.\d+)?$", c.replace(",", ""))]
        nums = [n for n in nums if n is not None]
        if len(nums) >= 6:
            return cells[idx], nums
    return None, None


def post(s, soup, click_name, click_val, grp1_val, year):
    action = soup.find("form").get("action")
    d = fields(soup)
    d["grp1"] = grp1_val
    d[click_name] = click_val
    r = s.post(BASE + action, data=d,
               headers={"Referer": f"{BASE}Navegar.aspx?y={year}&ap=ActProy"}, timeout=60)
    return BeautifulSoup(r.text, "lxml")


def scrape_year(s, year):
    s.get(f"{BASE}default.aspx?y={year}&ap=ActProy", timeout=40)
    soup = BeautifulSoup(s.get(f"{BASE}Navegar.aspx?y={year}&ap=ActProy", timeout=40).text, "lxml")
    sel = soup.select_one("#ctl00_CPH1_DrpYear option[selected]")
    if not sel or sel.get_text(strip=True) != str(year):
        raise RuntimeError(f"año no fijado ({sel.get_text(strip=True) if sel else '?'})")
    g = soup.select_one('input[name=grp1]')
    grp1 = g.get("value") if g else None

    soup = post(s, soup, "ctl00$CPH1$BtnTipoGobierno", "Nivel de Gobierno", grp1, year)
    rows = rows_with_grp1(soup)
    e = next((v for l, v in rows if l and l.strip().upper().startswith("E:")), None)
    if not e:
        raise RuntimeError("no encontré E: GOBIERNO NACIONAL")

    soup = post(s, soup, "ctl00$CPH1$BtnSector", "Sector", e, year)
    rows = rows_with_grp1(soup)
    sec = next((v for l, v in rows if l and re.match(r"^0*10\s*:", l.strip())), None)
    if not sec:
        raise RuntimeError("no encontré sector 10 EDUCACION")

    soup = post(s, soup, "ctl00$CPH1$BtnPliego", "Pliego", sec, year)
    label, nums = parse_target_row(soup, PLIEGO)
    if not nums:
        raise RuntimeError(f"no encontré fila pliego {PLIEGO}")
    return label, nums


def build_record(year, nums):
    pia, pim, cert = nums[0], nums[1], nums[2]
    if len(nums) >= 8:
        dev, gir = nums[5], nums[6]
    elif len(nums) == 7:
        dev, gir = nums[4], nums[5]
    else:
        dev, gir = nums[-2], nums[-1]
    ejec = round(100 * dev / pim, 1) if pim else 0
    return {"year": year, "pia": pia, "pim": pim, "cert": cert,
            "dev": dev, "gir": gir, "ejec_pct": ejec}


def main():
    lo = int(sys.argv[1]) if len(sys.argv) > 1 else 2012
    hi = int(sys.argv[2]) if len(sys.argv) > 2 else 2026
    years = list(range(lo, hi + 1))
    results = {}
    s = new_session()
    for y in years:
        got = False
        for attempt in range(4):
            try:
                label, nums = scrape_year(s, y)
                rec = build_record(y, nums)
                results[y] = rec
                print(f"[{y}] {label} nums={nums}\n   -> PIA {rec['pia']/1e6:.1f}M PIM {rec['pim']/1e6:.1f}M "
                      f"Cert {rec['cert']/1e6:.1f}M Dev {rec['dev']/1e6:.1f}M Gir {rec['gir']/1e6:.1f}M "
                      f"({rec['ejec_pct']}%)", flush=True)
                got = True
                break
            except Exception as e:
                print(f"[{y}] intento {attempt}: {repr(e)[:80]}", flush=True)
                time.sleep(6)
                s = new_session()
        if not got:
            print(f"[{y}] FALLO tras reintentos", flush=True)
        time.sleep(2)

    json.dump({str(y): r for y, r in results.items()},
              open(os.path.join(HERE, "ca_villarreal_raw.json"), "w"), ensure_ascii=False)
    print("\nAnios obtenidos:", sorted(results.keys()), flush=True)


if __name__ == "__main__":
    main()
