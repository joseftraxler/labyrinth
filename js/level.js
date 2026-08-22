import {DIRS} from "./draw.js";
import {SAW_REACH} from "./physics.js";

/**
 * Level rozparsuje labyrint předaný jako seznam řádků (stringů).
 *
 * Prvním parametrem je rychlost běhu v procentech základní rychlosti
 * (100 = BASE_SPEED, 130 = o třetinu rychleji). Místo čísla jde předat objekt
 * `{speed, theme}` a levelu tím dát prostředí – `'cellar'` je zatuchlý sklep
 * s cihlami a pavučinami, `'kitchen'` kachlíková kuchyň s drobky, `'sewer'`
 * betonová kanalizace s vodou u stěn. Téma je čistě vzhled (a motiv hudby),
 * hra běží stejně. Level si tady drží jen jeho jméno – co znamená, ví třída
 * prostředí v `js/themes/`.
 *
 * Mapa je mřížka buněk: myš startuje uprostřed (`P`), sbírá po labyrintu sýr
 * a teprve **s posledním kouskem se otevře východ** (`F`) v obvodové zdi.
 * Do té doby je ve východu zavřená mříž a myš se o ni zapře jako o zeď –
 * ví to `isBarred`, a co se dá projít, říká `blocks`. Legenda znaků:
 *   #        zeď labyrintu (myš se o ni zastaví, neumře)
 *   mezera   chodba
 *   P        start – doupě uprostřed labyrintu
 *   F        východ z labyrintu (jediný, leží v obvodové zdi)
 *   *        sýr – všechen se musí posbírat, jinak se východ neotevře
 *   T        sklapovací past – cyklicky sklapne, spouští ji hodiny, ne myš
 *   H        propadlo v podlaze – cyklicky se otevře
 *   S        pila jezdící sem a tam po své chodbě
 *   C        kočka – hlídkuje labyrintem a myš, kterou uvidí, se snaží chytit
 *
 * Mimo mapu je zeď: labyrint je uzavřený a ven vede jen `F`.
 */
export class Level {
    constructor(options, ...rows) {
        const config = typeof options === 'number' ? {speed: options} : options;
        this.speed = config.speed;
        this.theme = config.theme ?? null;
        this.rows = rows;
        this.height = rows.length;
        this.width = Math.max(...rows.map(r => r.length));

        this.walls = [];        // walls[y][x] = true, pokud je zeď
        this.traps = [];        // traps[y][x] = 'snap' | 'pit' | null
        this.cheese = [];       // cheese[y][x] = true, pokud tam leží nesebraný sýr
        this.cheeseCells = [];  // [{x, y}] – kde sýr původně ležel (kvůli plánku)
        this.cheeseCount = 0;
        this.cheeseLeft = 0;
        this.sawSpawns = [];    // [{x, y, axis, from, to}]
        this.catSpawns = [];    // [{x, y}]
        this.start = {x: 1, y: 1};
        this.exit = {x: 0, y: 1};

        this.#parse();
        this.#measureSaws();
        this.#measureExit();

        // Vzdálenost každé buňky od východu (v buňkách, po chodbách). Z ní se
        // počítá postup v HUD a podle ní se za myší žene kočka.
        this.exitDist = this.#flood(this.exit.x, this.exit.y);
        this.startDist = this.distanceToExit(this.start.x, this.start.y);
    }

    #parse() {
        for (let y = 0; y < this.height; y++) {
            const wallRow = [];
            const trapRow = [];
            const cheeseRow = [];
            const row = this.rows[y] ?? '';

            for (let x = 0; x < this.width; x++) {
                const ch = row[x] ?? '#';

                let wall = false;
                let trap = null;
                let cheese = false;

                switch (ch) {
                    case '#':
                        wall = true;
                        break;
                    case 'T':
                        trap = 'snap';
                        break;
                    case 'H':
                        trap = 'pit';
                        break;
                    case 'S':
                        this.sawSpawns.push({x, y});
                        break;
                    case 'C':
                        this.catSpawns.push({x, y});
                        break;
                    case '*':
                        cheese = true;
                        this.cheeseCells.push({x, y});
                        this.cheeseCount++;
                        this.cheeseLeft++;
                        break;
                    case 'P':
                        this.start = {x, y};
                        break;
                    case 'F':
                        this.exit = {x, y};
                        break;
                }

                wallRow.push(wall);
                trapRow.push(trap);
                cheeseRow.push(cheese);
            }

            this.walls.push(wallRow);
            this.traps.push(trapRow);
            this.cheese.push(cheeseRow);
        }
    }

    /**
     * Ke každé pile dopočítá úsek chodby, po kterém jezdí: osu (vodorovná/svislá)
     * a krajní buňky. Je to vlastnost mapy, ne pily – proto se to počítá tady
     * jednou a ne v každém pokusu znovu.
     *
     * Úsek sahá nejvýš `SAW_REACH` buněk na každou stranu (a končí dřív, když
     * chodba skončí). Pila tedy nikdy nepročesává celou chodbu – k čemu je to
     * dobré, stojí u konstanty v `js/physics.js`.
     */
    #measureSaws() {
        for (const saw of this.sawSpawns) {
            const horizontal = this.isFree(saw.x - 1, saw.y) || this.isFree(saw.x + 1, saw.y);
            saw.axis = horizontal ? 'x' : 'y';

            const step = horizontal ? {x: 1, y: 0} : {x: 0, y: 1};
            const base = horizontal ? saw.x : saw.y;
            let from = base;
            let to = base;

            for (let i = 1; i <= SAW_REACH && this.isFree(saw.x - step.x * i, saw.y - step.y * i); i++) {
                from = base - i;
            }
            for (let i = 1; i <= SAW_REACH && this.isFree(saw.x + step.x * i, saw.y + step.y * i); i++) {
                to = base + i;
            }

            saw.from = from;
            saw.to = to;
        }
    }

    /**
     * Kudy z východu ven z labyrintu. Východ leží v obvodové zdi, takže na
     * jednu stranu z něj vede chodba a na druhé už mapa není – a právě tam se
     * kreslí ráj, do kterého se utíká (`Theme.drawExit`).
     *
     * Je to jediné místo hry, které má „ven“ a „dovnitř“: dveře ve zdi natočení
     * mají, protože se otáčejí i s ní.
     */
    #measureExit() {
        let out = null;
        for (const d of DIRS) {
            if (!this.#inside(this.exit.x + d.x, this.exit.y + d.y)) out = d;
        }

        // Ručně nakreslená mapa může mít východ i uvnitř – pak míří ven na
        // opačnou stranu, než odkud k němu vede chodba.
        if (!out) {
            const way = DIRS.find(d => this.isFree(this.exit.x + d.x, this.exit.y + d.y)) ?? DIRS[0];
            out = {x: -way.x, y: -way.y};
        }

        this.exitOut = out;
        this.exitAngle = Math.atan2(out.y, out.x);
    }

    /** Vzdálenosti všech buněk od zadané buňky (po chodbách, −1 = nedosažitelná). */
    #flood(sx, sy) {
        const dist = [];
        for (let y = 0; y < this.height; y++) dist.push(new Array(this.width).fill(-1));

        if (!this.#inside(sx, sy)) return dist;

        dist[sy][sx] = 0;
        const queue = [{x: sx, y: sy}];

        for (let head = 0; head < queue.length; head++) {
            const cell = queue[head];
            for (const d of DIRS) {
                const x = cell.x + d.x;
                const y = cell.y + d.y;
                if (!this.isFree(x, y) || dist[y][x] >= 0) continue;
                dist[y][x] = dist[cell.y][cell.x] + 1;
                queue.push({x, y});
            }
        }

        return dist;
    }

    #inside(x, y) {
        return x >= 0 && y >= 0 && x < this.width && y < this.height;
    }

    /** Je tahle buňka až za okrajem mapy? Za východem tam začíná ráj. */
    outside(x, y) {
        return !this.#inside(x, y);
    }

    /** Mimo mapu je zeď – labyrint je uzavřený a ven vede jenom východ. */
    isWall(x, y) {
        return !this.#inside(x, y) || this.walls[y][x];
    }

    isFree(x, y) {
        return !this.isWall(x, y);
    }

    trapAt(x, y) {
        return this.#inside(x, y) ? this.traps[y][x] : null;
    }

    hasCheese(x, y) {
        return this.#inside(x, y) && this.cheese[y][x];
    }

    /** Sebere sýr, vrátí true, pokud tam nějaký byl. */
    takeCheese(x, y) {
        if (this.hasCheese(x, y)) {
            this.cheese[y][x] = false;
            this.cheeseLeft--;
            return true;
        }
        return false;
    }

    isExit(x, y) {
        return x === this.exit.x && y === this.exit.y;
    }

    /**
     * Je východ otevřený? Mříž povolí, až když je v labyrintu posbíraný
     * všechen sýr – bez něj se do myšího ráje nechodí.
     */
    get exitOpen() {
        return this.cheeseLeft <= 0;
    }

    /** Stojí v téhle buňce zavřená mříž východu? */
    isBarred(x, y) {
        return this.isExit(x, y) && !this.exitOpen;
    }

    /**
     * Co zastaví běžící zvíře: zeď labyrintu i zavřená mříž východu. Kolize se
     * ptají sem, kdežto tvar mapy (dosvit, vzdálenosti, plánek) se ptá
     * `isWall` – mříž je věc pokusu, ne labyrintu.
     */
    blocks(x, y) {
        return this.isWall(x, y) || this.isBarred(x, y);
    }

    /** Kolik buněk chodbami zbývá k východu (−1, když se tam nedá dojít). */
    distanceToExit(x, y) {
        return this.#inside(x, y) ? this.exitDist[y][x] : -1;
    }

    /** Kolik cest vede z buňky dál – 1 znamená slepou uličku. */
    exits(x, y) {
        let count = 0;
        for (const d of DIRS) if (this.isFree(x + d.x, y + d.y)) count++;
        return count;
    }
}
