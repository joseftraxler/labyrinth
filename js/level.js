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
 * Mapa je mřížka buněk: myš startuje uprostřed (`P`), utíká k východu (`F`)
 * v obvodové zdi a cestou sbírá sýr. Legenda znaků:
 *   #        zeď labyrintu (myš se o ni zastaví, neumře)
 *   mezera   chodba
 *   P        start – doupě uprostřed labyrintu
 *   F        východ z labyrintu (jediný, leží v obvodové zdi)
 *   *        sýr (body navíc, k útěku není potřeba)
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
        this.cheeseCount = 0;
        this.sawSpawns = [];    // [{x, y, axis, from, to}]
        this.catSpawns = [];    // [{x, y}]
        this.start = {x: 1, y: 1};
        this.exit = {x: 0, y: 1};

        this.#parse();
        this.#measureSaws();

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
                        this.cheeseCount++;
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
            return true;
        }
        return false;
    }

    isExit(x, y) {
        return x === this.exit.x && y === this.exit.y;
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
