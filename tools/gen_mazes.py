#!/usr/bin/env python3
"""Generátor labyrintů pro hru Labyrint.

Postaví labyrint, nastraží do něj pasti a **simulací ověří, že se dá projít** –
teprve pak zapíše `js/levels/levelX.js`. Když level neprojde, skript skončí
chybou a nic nezapíše: raději žádná mapa než nehratelná.

Pohybový model i časování pastí jsou tady **kopií** toho, co má hra
(`js/physics.js`, `js/traps.js`, `js/entities/*`). Když se změní tam, musí se to
změnit i tady – jinak generátor ověřuje jinou hru, než jakou hráč hraje.

Použití:
    python3 tools/gen_mazes.py               # přegeneruje všechny levely
    python3 tools/gen_mazes.py --check       # jen ověří plán, nic nezapíše
    python3 tools/gen_mazes.py --verify js/levels/level4.js
    python3 tools/gen_mazes.py --paths js/levels/level4.js
"""

import argparse
import hashlib
import json
import math
import random
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LEVEL_DIR = ROOT / "js" / "levels"

# ---- Kopie herních konstant (js/physics.js, js/traps.js) --------------------

BASE_SPEED = 2.35
MOUSE_HIT = 0.36
SAW_HIT = 0.46
SAW_SPEED = 0.60
SAW_REACH = 2          # o kolik buněk pila zajede na každou stranu

SNAP_PERIOD = 2.6
SNAP_CLOSED = 0.85
PIT_PERIOD = 3.4
PIT_OPEN = 1.30

# Jak daleko od středu buňky past ještě dosáhne (js/game.js, `Game.deadly`)
TRAP_REACH = 0.44

DIRS = [(1, 0), (0, 1), (-1, 0), (0, -1)]


def phase(x, y):
    """Fáze pasti v buňce – musí sedět na `phase()` v js/traps.js."""
    v = math.sin(x * 127.1 + y * 311.7) * 43758.5453
    return v - math.floor(v)


def snap_closed(x, y, clock):
    t = (clock + phase(x, y) * SNAP_PERIOD) % SNAP_PERIOD
    return t >= SNAP_PERIOD - SNAP_CLOSED


def pit_open(x, y, clock):
    t = (clock + phase(x, y) * PIT_PERIOD) % PIT_PERIOD
    return t >= PIT_PERIOD - PIT_OPEN


# ---- Plán úrovní -----------------------------------------------------------

# Světy se **střídají** – hráč tak vidí všechna prostředí od začátku a žádná
# část hry nevypadá dlouho stejně. Bez tématu (kamenné katakomby) jsou levely
# 1, 5 a 9; i „žádné téma“ je prostředí a taky se střídá.
LEVEL_PLAN = [
    # size = strana labyrintu v buňkách (vždy liché), speed = % základní rychlosti.
    # Nástrahy přibývají po druzích, ne hromadně: první level je jen labyrint
    # se dvěma sklapovačkami, propadla se přidají ve druhém, pily ve třetím
    # a kočka až ve čtvrtém – každý svět tak přinese jednu novou věc k naučení.
    dict(size=15, speed=100, theme=None,      loops=2, snaps=2, pits=0, saws=0, cats=0, cheese=4),
    dict(size=17, speed=102, theme="cellar",  loops=2, snaps=4, pits=2, saws=0, cats=0, cheese=5),
    dict(size=19, speed=104, theme="kitchen", loops=3, snaps=5, pits=2, saws=1, cats=0, cheese=5),
    dict(size=21, speed=106, theme="sewer",   loops=4, snaps=4, pits=4, saws=1, cats=1, cheese=6),
    dict(size=23, speed=108, theme=None,      loops=5, snaps=6, pits=4, saws=1, cats=1, cheese=6),
    dict(size=25, speed=110, theme="cellar",  loops=6, snaps=7, pits=4, saws=2, cats=1, cheese=7),
    dict(size=27, speed=112, theme="kitchen", loops=7, snaps=8, pits=4, saws=2, cats=2, cheese=7),
    dict(size=29, speed=114, theme="sewer",   loops=8, snaps=7, pits=6, saws=2, cats=2, cheese=8),
    dict(size=31, speed=116, theme=None,      loops=10, snaps=8, pits=6, saws=3, cats=2, cheese=8),
    dict(size=33, speed=120, theme="cellar",  loops=11, snaps=9, pits=7, saws=3, cats=2, cheese=9),
]


# ---- Stavba labyrintu ------------------------------------------------------


class Maze:
    """Mřížka znaků. Buňky jsou na lichých souřadnicích, zdi mezi nimi na sudých."""

    def __init__(self, size):
        self.size = size
        self.grid = [["#"] * size for _ in range(size)]

    def __getitem__(self, pos):
        x, y = pos
        return self.grid[y][x]

    def __setitem__(self, pos, value):
        x, y = pos
        self.grid[y][x] = value

    def inside(self, x, y):
        return 0 <= x < self.size and 0 <= y < self.size

    def free(self, x, y):
        return self.inside(x, y) and self.grid[y][x] != "#"

    def rows(self):
        return ["".join(row) for row in self.grid]

    def cells(self):
        for y in range(1, self.size, 2):
            for x in range(1, self.size, 2):
                yield x, y


def carve(size, rng):
    """Vyhloubí labyrint prohledáváním do hloubky (dokonalý labyrint bez smyček)."""
    maze = Maze(size)
    start = (size // 2 | 1, size // 2 | 1)
    maze[start] = " "

    stack = [start]
    while stack:
        x, y = stack[-1]
        options = []
        for dx, dy in DIRS:
            nx, ny = x + dx * 2, y + dy * 2
            if maze.inside(nx, ny) and maze[nx, ny] == "#":
                options.append((nx, ny, x + dx, y + dy))

        if not options:
            stack.pop()
            continue

        nx, ny, wx, wy = rng.choice(options)
        maze[wx, wy] = " "
        maze[nx, ny] = " "
        stack.append((nx, ny))

    return maze, start


def braid(maze, rng, count):
    """Probourá pár zdí navíc.

    Dokonalý labyrint má mezi dvěma místy jedinou cestu, takže před kočkou není
    kam uhnout a chybný odbočka znamená dlouhou cestu zpátky. Smyčky z toho
    dělají labyrint, ve kterém se dá manévrovat.
    """
    walls = []
    for y in range(1, maze.size - 1):
        for x in range(1, maze.size - 1):
            if maze[x, y] != "#":
                continue
            vertical = maze.free(x, y - 1) and maze.free(x, y + 1)
            horizontal = maze.free(x - 1, y) and maze.free(x + 1, y)
            if vertical != horizontal:
                walls.append((x, y))

    rng.shuffle(walls)
    for x, y in walls[:count]:
        maze[x, y] = " "


def flood(maze, start):
    """Vzdálenosti všech buněk od startu, po chodbách."""
    dist = {start: 0}
    queue = [start]
    head = 0
    while head < len(queue):
        x, y = queue[head]
        head += 1
        for dx, dy in DIRS:
            nx, ny = x + dx, y + dy
            if not maze.free(nx, ny) or (nx, ny) in dist:
                continue
            dist[(nx, ny)] = dist[(x, y)] + 1
            queue.append((nx, ny))
    return dist


def open_exit(maze, start):
    """Prorazí ven jedinou díru – tu nejvzdálenější od doupěte."""
    dist = flood(maze, start)
    best, best_dist = None, -1

    for i in range(1, maze.size - 1, 2):
        for x, y, inx, iny in (
            (i, 0, i, 1),
            (i, maze.size - 1, i, maze.size - 2),
            (0, i, 1, i),
            (maze.size - 1, i, maze.size - 2, i),
        ):
            d = dist.get((inx, iny), -1)
            if d > best_dist:
                best, best_dist = (x, y), d

    maze[best] = "F"
    return best


# ---- Nastražení pastí ------------------------------------------------------


def straight_run(maze, x, y, axis):
    """Délka rovného úseku chodby, ve kterém buňka leží (kvůli pilám)."""
    dx, dy = (1, 0) if axis == "x" else (0, 1)
    length = 1
    for sign in (-1, 1):
        i = 1
        while maze.free(x + dx * i * sign, y + dy * i * sign):
            length += 1
            i += 1
    return length


def is_bridge(maze, start, exit_cell, cell):
    """Vede přes tuhle buňku jediná cesta k východu?"""
    saved = maze[cell]
    maze[cell] = "#"
    reachable = exit_cell in flood(maze, start)
    maze[cell] = saved
    return not reachable


def track_cells(maze, x, y):
    """Buňky, po kterých bude jezdit pila z téhle výchozí buňky."""
    horizontal = maze.free(x - 1, y) or maze.free(x + 1, y)
    dx, dy = (1, 0) if horizontal else (0, 1)

    cells = [(x, y)]
    for sign in (-1, 1):
        i = 1
        while i <= SAW_REACH and maze.free(x + dx * i * sign, y + dy * i * sign):
            cells.append((x + dx * i * sign, y + dy * i * sign))
            i += 1

    key = (lambda c: c[0]) if horizontal else (lambda c: c[1])
    return sorted(cells, key=key)


def furnish(maze, start, exit_cell, plan, rng):
    """Rozmístí pasti, pily, kočky a sýr.

    Dvě pravidla, bez kterých se levely rozsypou:

    - **Mezi dvěma nástrahami musí zbýt aspoň dvě volné buňky** (`SPACING`).
      Sklapovačka i propadlo se dají přeběhnout, když se počká na správnou
      chvíli – jenže čeká se popobíháním tam a zpátky a otočka padne doprostřed
      buňky. Se dvěma pastmi obtékajícími jedinou volnou buňku by se myš musela
      otáčet přímo na pasti, takže by nebylo kde počkat.
    - **Na dráze pily nesmí být nic jiného.** Pila po své chodbě jezdí sem
      a tam, takže past uprostřed by z celé chodby udělala nepřekonatelnou past
      i tam, kde jinudy cesta nevede.
    """
    dist = flood(maze, start)
    free = [c for c in dist if c not in (start, exit_cell)]
    rng.shuffle(free)

    def degree(cell):
        x, y = cell
        return sum(1 for dx, dy in DIRS if maze.free(x + dx, y + dy))

    hazards = {start, exit_cell}

    def crowded(cell):
        x, y = cell
        near = range(-SPACING, SPACING + 1)
        return any((x + dx, y + dy) in hazards for dx in near for dy in near)

    # Pily jako první – potřebují celou chodbu jen pro sebe
    saws = 0
    for cell in free:
        if saws >= plan["saws"]:
            break
        if crowded(cell) or degree(cell) > 2:
            continue
        x, y = cell
        if max(straight_run(maze, x, y, "x"), straight_run(maze, x, y, "y")) < 5:
            continue
        # V jednopolíčkové chodbě se pile uhnout nedá, takže nesmí stát v jediné
        # cestě k východu – jinak by z ní nebyla past, ale závora.
        if is_bridge(maze, start, exit_cell, cell):
            continue

        track = track_cells(maze, x, y)
        if any(c in hazards for c in track):
            continue
        # Chodba pily nesmí končit slepě: kdo do ní vběhne, musí mít kudy ven
        # i na druhé straně, jinak je z ústupu past.
        if any(degree(c) < 2 for c in (track[0], track[-1])):
            continue
        # A hlavně musí mít **odbočku uvnitř dráhy pily**. Myš je rychlejší než
        # pila, takže ji v rovné chodbě vždycky dojede zezadu a proti ní se
        # neprotáhne – z chodby bez odbočky by tak nebyla past, ale zeď.
        # S odbočkou je z pily to, čím má být: rozcestí, přes které se musí
        # proběhnout ve správnou chvíli.
        if not any(degree(c) >= 3 for c in track):
            continue

        maze[cell] = "S"
        hazards.update(track)
        saws += 1

    # Sklapovačky a propadla patří do chodeb, ne do slepých uliček – ve slepé
    # uličce by je hráč nikdy nemusel překonat
    snaps, pits = 0, 0
    for cell in free:
        if snaps >= plan["snaps"] and pits >= plan["pits"]:
            break
        if crowded(cell) or degree(cell) < 2 or dist[cell] <= 2:
            continue

        char = "T" if snaps < plan["snaps"] else "H"
        maze[cell] = char
        hazards.add(cell)
        if char == "T":
            snaps += 1
        else:
            pits += 1

    # Kočka nesmí čekat u doupěte – myš musí mít čas se rozeběhnout
    cats = 0
    for cell in free:
        if cats >= plan["cats"]:
            break
        if cell in hazards or dist[cell] <= 6:
            continue
        maze[cell] = "C"
        hazards.add(cell)
        cats += 1

    cheese = 0
    for cell in free:
        if cheese >= plan["cheese"]:
            break
        if cell in hazards:
            continue
        maze[cell] = "*"
        hazards.add(cell)
        cheese += 1

    maze[start] = "P"


# ---- Ověření průchodnosti --------------------------------------------------


def saw_tracks(maze):
    """Úseky, po kterých jezdí pily – stejný výpočet jako `Level.#measureSaws`."""
    tracks = []
    for y in range(maze.size):
        for x in range(maze.size):
            if maze[x, y] != "S":
                continue

            horizontal = maze.free(x - 1, y) or maze.free(x + 1, y)
            axis = "x" if horizontal else "y"
            dx, dy = (1, 0) if horizontal else (0, 1)

            base = x if horizontal else y
            start, end = base, base
            i = 1
            while i <= SAW_REACH and maze.free(x - dx * i, y - dy * i):
                start = base - i
                i += 1
            i = 1
            while i <= SAW_REACH and maze.free(x + dx * i, y + dy * i):
                end = base + i
                i += 1

            tracks.append(dict(x=x, y=y, axis=axis, start=start, end=end, phase=phase(x, y)))
    return tracks


def saw_at(track, clock, speed):
    """Poloha pily v čase – kopie `Saw.#along` z js/entities/saw.js."""
    span = track["end"] - track["start"]
    if span <= 0:
        along = track["start"]
    else:
        v = speed * SAW_SPEED
        period = 2 * span / v
        u = ((clock + track["phase"] * period) % period) * v
        along = track["start"] + u if u <= span else track["start"] + 2 * span - u

    if track["axis"] == "x":
        return along + 0.5, track["y"] + 0.5
    return track["x"] + 0.5, along + 0.5


def trap_safe(maze, cell, arrival, speed):
    """Je past v buňce bezpečná po celou dobu, kdy je myš v jejím dosahu?

    Myš je uvnitř dosahu pasti od `arrival - TRAP_REACH/speed` do
    `arrival + TRAP_REACH/speed`. Kontrola je schválně o kousek širší (půl
    buňky), ať generátor spíš zbytečně odmítne, než aby pustil past, kterou by
    hráč nemohl proběhnout.
    """
    char = maze[cell]
    if char not in ("T", "H"):
        return True

    x, y = cell
    reach = 0.5 / speed
    steps = 12
    for i in range(steps + 1):
        t = arrival - reach + 2 * reach * i / steps
        if t < 0:
            continue
        if char == "T" and snap_closed(x, y, t):
            return False
        if char == "H" and pit_open(x, y, t):
            return False
    return True


def saws_safe(tracks, frm, to, start_time, dt, speed):
    """Neprojede myš při přeběhu z buňky do buňky pilou?"""
    if not tracks:
        return True

    reach = MOUSE_HIT + SAW_HIT
    steps = 8
    for i in range(steps + 1):
        t = start_time + dt * i / steps
        mx = frm[0] + 0.5 + (to[0] - frm[0]) * i / steps
        my = frm[1] + 0.5 + (to[1] - frm[1]) * i / steps
        for track in tracks:
            sx, sy = saw_at(track, t, speed)
            if (sx - mx) ** 2 + (sy - my) ** 2 < reach * reach:
                return False
    return True


def find_path(maze, start, exit_cell, speed_pct, limit=2400):
    """Najde posloupnost přeběhů z doupěte k východu, nebo `None`.

    Prohledávání běží **po vrstvách času**: přeběh mezi sousedními buňkami trvá
    vždycky stejně (`1 / rychlost`), takže je čas ve vrstvě přesně daný a stačí
    si pamatovat, které buňky jsou v které vrstvě dosažitelné. Myš se může
    kdykoliv otočit, takže „čekání“ na past je v grafu obyčejné popobíhání tam
    a zpátky – nemusí se modelovat zvlášť.

    Kočky se neověřují: reagují na hráče, takže by výsledek stejně neplatil.
    Férové je to i bez toho, protože kočka je pomalejší než myš a myš ji uvidí
    dřív než ona ji (`CAT_SPEED`, `CAT_SIGHT` v js/physics.js).
    """
    speed = BASE_SPEED * speed_pct / 100
    dt = 1 / speed
    tracks = saw_tracks(maze)

    layers = [{start: None}]        # vrstva = buňka -> odkud se do ní přiběhlo
    found = -1

    for k in range(limit):
        layer = layers[-1]
        if exit_cell in layer:
            found = k
            break

        clock = k * dt
        nxt = {}
        for (x, y) in layer:
            for dx, dy in DIRS:
                cell = (x + dx, y + dy)
                if not maze.free(*cell) or cell in nxt:
                    continue
                # Buňka se přebíhá od hranice k hranici, takže doprostřed té
                # další doběhne myš o půl buňky později (js/entities/runner.js)
                if not trap_safe(maze, cell, clock + 1.5 * dt, speed):
                    continue
                if not saws_safe(tracks, (x, y), cell, clock + 0.5 * dt, dt, speed):
                    continue
                nxt[cell] = (x, y)

        if not nxt:
            return None
        layers.append(nxt)

    if found < 0:
        return None

    # Zpětný chod: každá vrstva si drží, odkud se do buňky přiběhlo
    path = [exit_cell]
    cell = exit_cell
    for index in range(found, 0, -1):
        cell = layers[index][cell]
        path.append(cell)
    path.reverse()
    return path


# ---- Zápis levelů ----------------------------------------------------------


def fingerprint(rows):
    return hashlib.md5("\n".join(rows).encode()).hexdigest()[:8]


def render(rows, index, plan):
    theme = plan["theme"]
    options = f"{{speed: {plan['speed']}, theme: '{theme}'}}" if theme else str(plan["speed"])
    body = ",\n".join(f'    "{row}"' for row in rows)

    return f"""import {{Level}} from "../level.js";

// Soubor generuje tools/gen_mazes.py (otisk mapy {fingerprint(rows)}).
// Ruční úpravu generátor podle otisku pozná a soubor nepřepíše;
// vynutit přegenerování jde přepínačem --force.
// První argument = rychlost běhu v % základní rychlosti (100 = BASE_SPEED).
const level{index} = new Level(
    {options},
{body},
);

export {{level{index}}};
"""


def read_level(path):
    """Vytáhne ze souboru levelu mapu, rychlost, téma a uložený otisk."""
    text = path.read_text()
    rows = re.findall(r'^    "(.*)",$', text, re.M)
    speed = int(re.search(r"speed: (\d+)", text).group(1)) if "speed:" in text else int(
        re.search(r"new Level\(\s*(\d+)", text).group(1))
    theme_match = re.search(r"theme: '(\w+)'", text)
    stamp = re.search(r"otisk mapy (\w+)", text)

    return rows, speed, theme_match.group(1) if theme_match else None, stamp.group(1) if stamp else None


def maze_from_rows(rows):
    maze = Maze(len(rows))
    start = exit_cell = None
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            maze[x, y] = ch
            if ch == "P":
                start = (x, y)
            if ch == "F":
                exit_cell = (x, y)
    return maze, start, exit_cell


# Nejkratší cesta k východu musí být aspoň tolikrát delší než strana labyrintu.
# Je to hlavní páka na to, aby byl labyrint spíš spletitý než rychlý: hráč má
# hledat cestu, ne běžet rovně ven. Když se labyrint tak dlouhou cestou nepodaří
# postavit, generátor ho zahodí a zkusí jiný.
MIN_RUN = 2.4

# Kolik volných buněk musí zbýt mezi dvěma nástrahami. Míň než dvě znamená, že
# se mezi nimi nedá počkat: čeká se popobíháním tam a zpátky a otočka padne
# doprostřed buňky, takže by se myš musela otáčet přímo na pasti.
SPACING = 2


def build(index, plan):
    """Postaví level podle plánu a ověří ho. Zkouší, dokud nenajde průchodný."""
    for attempt in range(120):
        rng = random.Random(index * 1000 + attempt)
        maze, start = carve(plan["size"], rng)
        braid(maze, rng, plan["loops"])
        exit_cell = open_exit(maze, start)
        if flood(maze, start)[exit_cell] < plan["size"] * MIN_RUN:
            continue

        furnish(maze, start, exit_cell, plan, rng)

        path = find_path(maze, start, exit_cell, plan["speed"])
        if path:
            return maze, path

    raise SystemExit(f"level {index}: nepodařilo se postavit průchodný labyrint")


def main():
    parser = argparse.ArgumentParser(description="Generátor labyrintů")
    parser.add_argument("--check", action="store_true", help="jen ověří plán, nic nezapíše")
    parser.add_argument("--force", action="store_true", help="přepíše i ručně upravené mapy")
    parser.add_argument("--verify", metavar="SOUBOR", help="ověří průchodnost hotové mapy")
    parser.add_argument("--paths", metavar="SOUBOR", help="vypíše cestu k východu jako JSON")
    args = parser.parse_args()

    if args.verify or args.paths:
        path = Path(args.verify or args.paths)
        rows, speed, theme, _ = read_level(path)
        maze, start, exit_cell = maze_from_rows(rows)
        route = find_path(maze, start, exit_cell, speed)

        if not route:
            print(f"{path.name}: NEPRŮCHODNÝ", file=sys.stderr)
            return 1
        if args.paths:
            print(json.dumps(dict(speed=speed, theme=theme, path=route)))
        else:
            print(f"{path.name}: průchodný, {len(route) - 1} přeběhů")
        return 0

    for index, plan in enumerate(LEVEL_PLAN, start=1):
        maze, route = build(index, plan)
        rows = maze.rows()
        target = LEVEL_DIR / f"level{index}.js"

        if args.check:
            print(f"level{index}: {plan['size']}×{plan['size']}, {len(route) - 1} přeběhů k východu")
            continue

        if target.exists() and not args.force:
            old_rows, _, _, stamp = read_level(target)
            if stamp and stamp != fingerprint(old_rows):
                print(f"level{index}: ručně upravená mapa, přeskakuji")
                continue

        target.write_text(render(rows, index, plan))
        print(f"level{index}: zapsáno ({plan['size']}×{plan['size']}, {len(route) - 1} přeběhů)")

    return 0


if __name__ == "__main__":
    sys.exit(main())
