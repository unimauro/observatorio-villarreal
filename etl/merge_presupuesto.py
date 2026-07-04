#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Fusiona ca_villarreal_raw.json (2012-2024) en data/presupuesto-villarreal.json.
NO borra 2025/2026 ni detalle_ultimo_anio. Ordena ascendente. Recalcula ejec_pct.
"""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
JSON = os.path.join(ROOT, "data", "presupuesto-villarreal.json")
RAW = os.path.join(HERE, "ca_villarreal_raw.json")

CUR_YEAR = 2026  # año en curso (para parcial)


def rec(year, r):
    pia, pim, cert, dev, gir = r["pia"], r["pim"], r["cert"], r["dev"], r["gir"]
    ejec = round(100 * dev / pim, 1) if pim else 0
    o = {"year": year, "pia": pia, "pim": pim, "cert": cert,
         "dev": dev, "gir": gir, "ejec_pct": ejec}
    if year >= CUR_YEAR and ejec < 70:
        o["parcial"] = True
    return o


def main():
    data = json.load(open(JSON, encoding="utf-8"))
    raw = json.load(open(RAW, encoding="utf-8"))

    by_year = {int(e["year"]): e for e in data.get("serie", [])}
    # agregar 2012-2024 desde raw sin tocar los que ya existen (2025/2026)
    for ys, r in raw.items():
        y = int(ys)
        if y in by_year:
            continue  # no pisar años que otro proceso ya cargó
        by_year[y] = rec(y, r)

    data["serie"] = [by_year[y] for y in sorted(by_year)]

    data.setdefault("_meta", {})["nota"] = (
        "Serie 2012-2024 via Consulta Amigable MEF (pliego 524, drill Gob. Nacional "
        "-> Sector 10 Educacion -> UNFV); 2025 cerrado; 2026 en ejecucion (parcial)."
    )

    json.dump(data, open(JSON, "w", encoding="utf-8"),
              ensure_ascii=False, separators=(",", ":"))

    print("Serie final:", [e["year"] for e in data["serie"]])
    for e in data["serie"]:
        p = " PARCIAL" if e.get("parcial") else ""
        print(f"  {e['year']}: PIM {e['pim']/1e6:.1f}M dev {e['dev']/1e6:.1f}M "
              f"ejec {e['ejec_pct']}%{p}")


if __name__ == "__main__":
    main()
