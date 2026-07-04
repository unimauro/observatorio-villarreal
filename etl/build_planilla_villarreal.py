#!/usr/bin/env python3
"""Construye data/planilla-villarreal.json (personal UNFV, pliego 524).

Fuente: datos LOCALES de peru-transparente.
- Nominal con sueldo: funcionarios.csv (id_entidad 10035), periodo 2026-02, regimen CAS.
- Agregado por regimen: airhsp_por_pliego_regimen.csv.gz (pliego "U.N. FEDERICO VILLARREAL").
NUNCA incluye estudiantes. No inventa personas ni sueldos.
"""
import csv, gzip, json, statistics, os

PT = "/Users/unimauro/Documents/Repos/peru-transparente/data"
OUT = "/Users/unimauro/Documents/Repos/observatorio-villarreal/data/planilla-villarreal.json"
ID_ENTIDAD = "10035"

def fix(s):
    # unico mojibake en el subset UNFV: 'Ë' (0xCB) donde va 'Ó' (EDUCACION/RECREACION)
    return s.replace("Ë", "Ó").strip()

# ---- 1) Nominal con sueldo (PTE) ----
rows = [r for r in csv.reader(open(os.path.join(PT, "funcionarios.csv")))
        if r and r[0] == ID_ENTIDAD]
# Estructura PTE UNFV: la col 'cargo' trae la dependencia (facultad/oficina),
# la col 'dependencia' trae el monto duplicado; el sueldo real esta en
# total_ingreso_mensual. No hay titulo de cargo individual en la fuente.
personas = []
for r in rows:
    dep = fix(r[6])
    nombre = fix(r[5])
    try:
        remun = round(float(r[13]), 2)
    except ValueError:
        remun = None
    personas.append({
        "nombre": nombre,
        "cargo": "PERSONAL CAS",  # PTE UNFV no publica cargo individual
        "dependencia": dep,
        "regimen": "CAS (D.Leg. 1057)",
        "categoria": "administrativo",
        "remun": remun,
    })

remuns = [p["remun"] for p in personas if p["remun"] and p["remun"] > 0]
personas.sort(key=lambda p: (p["remun"] is not None, p["remun"] or 0), reverse=True)
total_nominal = len(personas)

# ---- 2) Agregado AIRHSP por regimen (pliego UNFV) ----
LABELS = {
    "Carreras Especiales": "Carreras Especiales (docentes universitarios)",
    "D. Leg. Nº 276": "D. Leg. Nº 276 (administrativo nombrado)",
    "D. Leg. 1057 CAS": "D. Leg. 1057 CAS",
    "Sin Regimen Laboral": "Sin Régimen Laboral",
    "Sin Régimen Laboral": "Sin Régimen Laboral",
    "Ley Nº 30057 SERVIR": "Ley Nº 30057 SERVIR",
}
airhsp = []
with gzip.open(os.path.join(PT, "airhsp_por_pliego_regimen.csv.gz"), "rt") as f:
    for row in csv.DictReader(f):
        if row["pliego"] == "U.N. FEDERICO VILLARREAL":
            airhsp.append({
                "nombre": LABELS.get(row["regimen"], row["regimen"]),
                "n": int(row["n"]),
                "sueldo_promedio": int(round(float(row["sueldo_promedio"]))),
            })
airhsp.sort(key=lambda x: x["n"], reverse=True)
total_airhsp = sum(x["n"] for x in airhsp)

# ---- 3) Resumen ----
por_regimen_nominal = [{"nombre": "CAS (D.Leg. 1057)", "n": total_nominal}]
por_categoria = [{"nombre": "administrativo", "n": total_nominal}]

remun_stats = {
    "prom": round(statistics.mean(remuns), 2),
    "mediana": round(statistics.median(remuns), 2),
    "min": min(remuns),
    "max": max(remuns),
    "n_con_dato": len(remuns),
    "n_cero_o_licencia": total_nominal - len(remuns),
    "nota": ("Remuneracion = total_ingreso_mensual (S/) del PTE, periodo 2026-02. "
             "Estadisticos calculados sobre remuneraciones > 0."),
}

nota = (
    "Solo docentes/funcionarios/personal administrativo. No incluye estudiantes. "
    "La unica lista NOMINAL con nombre y remuneracion real que publica el PTE para la "
    "UNFV (id_entidad PTE 10035, pliego 524) cubre el periodo 2026-02: 415 personas del "
    "regimen CAS (D.Leg. 1057). El PTE de la UNFV NO publica el cargo/titulo individual "
    "(la fila solo trae dependencia + remuneracion), por lo que no es posible distinguir "
    "nominalmente docente vs administrativo; se agrupan como 'administrativo' (personal "
    "CAS). El grueso del personal -docentes universitarios (regimen AIRHSP 'Carreras "
    "Especiales', 2225 plazas), administrativo nombrado D.Leg.276 (925) y las 3 altas "
    "autoridades Ley SERVIR (rector y vicerrectores)- NO tiene desglose nominal ni "
    "remuneracion individual en los datos locales; solo existe como agregado AIRHSP "
    "(conteo + sueldo promedio, ver resumen.por_regimen_airhsp). El directorio de "
    "autoridades (rectora Cristina Asuncion Alzamora Rivero, vicerrectores y decanos) "
    "figura en autoridades.csv sin remuneracion. No se inventaron personas ni sueldos."
)

out = {
    "_meta": {
        "fuente": ("peru-transparente (datos nominales del sector publico: Portal de "
                   "Transparencia Estandar / PTE + agregado AIRHSP)"),
        "entidad": "Universidad Nacional Federico Villarreal (UNFV) - pliego 524",
        "anio": 2026,
        "mes": 2,
        "nota": nota,
        "total": total_nominal,
        "total_planilla_airhsp": total_airhsp,
    },
    "resumen": {
        "por_regimen_nominal": por_regimen_nominal,
        "por_regimen_airhsp": airhsp,
        "por_categoria": por_categoria,
        "remun": remun_stats,
    },
    "personas": personas,
}

with open(OUT, "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=1)
print("OK", OUT)
print("nominal", total_nominal, "airhsp", total_airhsp)
print("remun", remun_stats["min"], remun_stats["max"], remun_stats["prom"], remun_stats["mediana"])
