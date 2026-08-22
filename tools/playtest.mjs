/**
 * Automatický průchod všemi levely v opravdovém prohlížeči.
 *
 * Skript spustí hru v Chromiu a nechá labyrinty proběhnout **autopilotem**:
 * ten drží myš namířenou na buňku, která je k východu nejblíž, a než ji tam
 * pustí, ověří, jestli tam v tu chvíli nebude sklapnutá past, pila nebo kočka.
 * Když ne, **zastaví a počká** (stejnou brzdou jako hráč) a vyrazí, jakmile se
 * past otevře. Hraje se **skutečným kódem hry** (`Game.update`), takže test
 * odhalí jak rozbitý pohyb, tak neprůchodný level.
 *
 * Autopilot je schválně hloupý: nezná budoucnost pastí dopředu ani plán
 * z generátoru. Když projde on, projde i hráč.
 *
 * Vyžaduje Node.js a balíček `playwright` (`npm i -D playwright`), proto to
 * není součást hry samotné, ale nástroj pro vývoj.
 *
 * Použití:
 *     node tools/playtest.mjs
 *     node tools/playtest.mjs --level 7      # jen jeden level
 *     node tools/playtest.mjs --headed       # ať je vidět, co se děje
 */
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {dirname, extname, join, normalize} from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const MIME = {
    '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
    '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
};

// Statický server – ES moduly se přes file:// nenačtou
function serve() {
    const server = createServer(async (req, res) => {
        const rel = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
        const path = join(ROOT, rel === '/' ? 'index.html' : rel);
        try {
            const body = await readFile(path);
            res.writeHead(200, {'Content-Type': MIME[extname(path)] ?? 'application/octet-stream'});
            res.end(body);
        } catch {
            res.writeHead(404).end('404');
        }
    });
    return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

/**
 * Odehraje jeden level uvnitř stránky: před každým snímkem řekne myši, kam
 * zahnout, a pak posune hru o pevný krok. Nečeká se na requestAnimationFrame,
 * takže je celý průchod hotový během chvilky.
 */
async function playInPage([levelIndex, dt, seconds, maxDeaths, trace]) {
    const traps = await import('./js/traps.js');
    const {angleDiff} = await import('./js/draw.js');
    const {TURN_RATE} = await import('./js/physics.js');
    const game = window.labyrinth;

    const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    const back = dir => (dir + 2) % 4;

    game.levelIndex = levelIndex;
    game.attempt = 1;
    game.best = 0;
    game.loadLevel();
    game.state = 'playing';

    let deaths = 0;
    let elapsed = 0;

    // Když se autopilot dlouho nikam nehne (kočka mu hlídkuje před nosem),
    // přestane si na ni hrát a projde kolem – přesně jak by to udělal hráč.
    let bestProgress = 0;
    let stuckFor = 0;
    const daring = () => stuckFor > 3;

    // Když ani obcházení nepomůže, přestane autopilot pilám uhýbat a zkusí to.
    // Umřít a zkusit to jinudy je pořád lepší výsledek testu než stát na místě.
    const reckless = () => stuckFor > 12;

    // Kde už myš umřela. Autopilot i hra jsou deterministické, takže bez téhle
    // paměti by každý další pokus dopadl přesně stejně – takhle se místu, kde
    // to nevyšlo, příště vyhne, jako by si to hráč zapamatoval.
    const graves = new Map();

    /**
     * Buňky, kterými cesta nevede, i když jsou průchozí: chodba, ve které
     * pila jezdí sem a tam, nebo místo, kde se to už dvakrát nepovedlo.
     */
    const avoid = new Set();
    let toExit = new Map();

    const key = (x, y) => `${x},${y}`;

    /** Vzdálenosti k východu po chodbách, s obcházením `avoid`. */
    const replan = () => {
        const level = game.level;
        toExit = new Map();

        const queue = [[level.exit.x, level.exit.y]];
        toExit.set(key(level.exit.x, level.exit.y), 0);

        for (let head = 0; head < queue.length; head++) {
            const [x, y] = queue[head];
            for (const [dx, dy] of DIRS) {
                const nx = x + dx;
                const ny = y + dy;
                const at = key(nx, ny);
                if (!level.isFree(nx, ny) || toExit.has(at) || avoid.has(at)) continue;
                toExit.set(at, toExit.get(key(x, y)) + 1);
                queue.push([nx, ny]);
            }
        }
    };

    const routed = () => toExit.has(key(game.mouse.cellX, game.mouse.cellY));

    /**
     * Vzdálenost k východu s obcházením. Buňky uvnitř odepsané chodby dostanou
     * skutečnou vzdálenost s velkou přirážkou – jinak by v nich myš, která se
     * do nich přece jen dostala, neměla kam jít.
     */
    const distanceOut = (x, y) => {
        const planned = toExit.get(key(x, y));
        if (planned !== undefined) return planned;

        const plain = game.level.distanceToExit(x, y);
        return plain < 0 ? -1 : plain + 100;
    };

    /** Odepíše místo, kde to nejde, a přepočítá cestu. U pily celou její chodbu. */
    const giveUpOn = (x, y) => {
        const added = [key(x, y)];

        for (const saw of game.saws) {
            const along = saw.axis === 'x' ? x : y;
            const across = saw.axis === 'x' ? y : x;
            const line = saw.axis === 'x' ? saw.spawnY : saw.spawnX;
            if (across !== line || along < saw.from - 1 || along > saw.to + 1) continue;

            for (let i = saw.from; i <= saw.to; i++) {
                added.push(saw.axis === 'x' ? key(i, line) : key(line, i));
            }
        }

        for (const at of added) avoid.add(at);
        replan();

        if (!routed()) {
            for (const at of added) avoid.delete(at);
            replan();
        }
    };

    replan();

    /** Všechno, co se hýbe a zabíjí. */
    const dangers = () => [...game.saws, ...game.cats];

    /** Je myši kočka v patách? Pak se před pastí nedá čekat, musí se objíždět. */
    const hunted = () => game.cats.some(cat => {
        const far = Math.hypot(cat.x - game.mouse.x, cat.y - game.mouse.y);
        return far < 3 || (cat.chase > 0 && far < 7);
    });

    /** Kam myš zrovna kouká, zaokrouhleno na světovou stranu. */
    const facing = () => {
        const quarter = Math.round(game.mouse.heading / (Math.PI / 2));
        return ((quarter % 4) + 4) % 4;
    };

    /** Co brání vběhnout do téhle buňky (`null` = nic). */
    const blocker = (x, y, dir, t) => {
        if (!safe(x, y, t)) return game.level.trapAt(x, y) ? 'trap' : 'cat';
        if (!reckless() && !runSafe(x, y, dir, t)) return 'saw';
        return null;
    };

    /**
     * Je bezpečné být v téhle buňce kolem času `t`? (pasti a kočky)
     */
    const safe = (x, y, t) => {
        const trap = game.level.trapAt(x, y);

        if (trap) {
            // Musí být otevřená po celou dobu, kdy je v ní myš – s rezervou na
            // to, že se rozjezd o kousek opozdí. Zastavit se dá kdykoliv
            // (brzdou), takže se nemusí hlídat celý přílet.
            const reach = 1.1 / game.runSpeed;
            const steps = 12;
            for (let i = 0; i <= steps; i++) {
                const when = t - reach + 2 * reach * i / steps;
                if (when < 0) continue;
                if (trap === 'snap' && traps.snapClosed(x, y, when)) return false;
                if (trap === 'pit' && traps.pitOpen(x, y, when)) return false;
            }
        }

        // Kočka se předpovědět nedá – od té se drží odstup
        const keep = daring() ? 0.9 : 1.6;
        for (const cat of game.cats) {
            if (Math.hypot(cat.x - x - 0.5, cat.y - y - 0.5) < keep) return false;
        }
        return true;
    };

    /**
     * Přehraje dopředu celý rovný úsek, po kterém by myš běžela, a ověří, že
     * se v něm s žádnou pilou nepotká. Pila je čistá funkce času, takže se jí
     * dá zeptat, kde bude, až tam myš doběhne – jinak by se do chodby vbíhalo
     * naslepo a v jednopolíčkové chodbě se pile uhnout nedá.
     */
    const runSafe = (x, y, dir, t) => {
        if (!game.saws.length) return true;

        for (let k = 0; k < 7; k++) {
            const cx = x + DIRS[dir][0] * k;
            const cy = y + DIRS[dir][1] * k;
            if (!game.level.isFree(cx, cy)) break;

            const when = t + k / game.runSpeed;
            for (const saw of game.saws) {
                for (let i = -2; i <= 3; i++) {
                    const at = saw.positionAt(when + i * 0.05);
                    if (Math.hypot(at.x - cx - 0.5, at.y - cy - 0.5) < 1.0) return false;
                }
            }

            // Za odbočkou se rozhoduje znovu, takže dál dopředu se dívat nemá
            // smysl – ale první tři buňky se prohlédnou vždycky.
            if (k > 2 && game.level.exits(cx, cy) > 2) break;
        }
        return true;
    };

    /**
     * Vede z téhle chodby ještě někam jinam? Couvnout do slepé uličky před
     * pilou je horší než běžet dál – proto se autopilot dívá, jestli za zády
     * najde odbočku dřív, než mu dojde chodba.
     */
    const hasWayOut = (x, y, dir) => {
        let cx = x;
        let cy = y;
        let heading = dir;

        for (let k = 0; k < 9; k++) {
            if (!game.level.isFree(cx, cy)) return false;
            if (game.level.isExit(cx, cy)) return true;

            const ways = game.level.exits(cx, cy);
            if (ways > 2) return true;
            if (ways < 2) return false;

            let next = null;
            for (const turn of [0, 1, 3]) {
                const dir2 = (heading + turn) % 4;
                if (game.level.isFree(cx + DIRS[dir2][0], cy + DIRS[dir2][1])) {
                    next = dir2;
                    break;
                }
            }
            if (next === null) return false;

            heading = next;
            cx += DIRS[heading][0];
            cy += DIRS[heading][1];
        }
        return true;
    };

    /** Jak daleko je nejbližší hrozba přímo před myší (Infinity = žádná). */
    const threatAhead = () => {
        const mouse = game.mouse;
        const ax = Math.cos(mouse.heading);
        const ay = Math.sin(mouse.heading);
        let closest = Infinity;

        for (const danger of dangers()) {
            const dx = danger.x - mouse.x;
            const dy = danger.y - mouse.y;
            const along = dx * ax + dy * ay;
            const aside = Math.abs(dy * ax - dx * ay);
            if (along > 0 && aside < 0.7) closest = Math.min(closest, along);
        }
        return closest;
    };

    /**
     * Kam zamířit. Autopilot drží nejkratší cestu k východu a **před zavřenou
     * pastí radši počká** – otočí se čelem do zdi, kde myš běží na místě, a jde
     * dál, až se past otevře. Objížďka se hledá jen před kočkou, protože ta se
     * sama pohne a čekat na ni nemá smysl.
     */
    const chooseGoal = () => {
        const mouse = game.mouse;
        const x = mouse.cellX;
        const y = mouse.cellY;
        const incoming = facing();
        const options = [];

        for (let dir = 0; dir < 4; dir++) {
            const nx = x + DIRS[dir][0];
            const ny = y + DIRS[dir][1];
            if (!game.level.isFree(nx, ny)) continue;

            const dist = distanceOut(nx, ny);
            if (dist < 0) continue;

            // Otáčení něco stojí, a otočka o 180° hodně: než se myš stočí,
            // ujede kus chodby a v úzké chodbě se přitom otře o sousední buňky.
            const turn = Math.abs(angleDiff(mouse.heading, Math.atan2(DIRS[dir][1], DIRS[dir][0])));
            const when = game.clock + turn / TURN_RATE
                + Math.hypot(nx + 0.5 - mouse.x, ny + 0.5 - mouse.y) / game.runSpeed;

            let cost = dist + turn * 0.7 + (turn > 2.5 ? 1.5 : 0) + 8 * (graves.get(key(nx, ny)) ?? 0);
            if (!daring()) {
                for (const cat of game.cats) {
                    const far = Math.hypot(cat.x - nx - 0.5, cat.y - ny - 0.5);
                    if (far < 3) cost += (3 - far) * 1.5;
                    if (far < 12 && !hasWayOut(nx, ny, dir)) cost += 15;
                }
            }

            options.push({dir, x: nx, y: ny, cost, blocker: blocker(nx, ny, dir, when)});
        }

        if (!options.length) return null;
        options.sort((a, b) => a.cost - b.cost);

        if (!options[0].blocker) return options[0];

        // Past se za chvíli natáhne, takže se před ní **počká** – myš zastaví
        // a zůstane na ni namířená, aby mohla vyrazit hned, jak se otevře.
        // Pilu jde přečkat taky, ale ne vždycky: v chodbě, kterou projíždí
        // celou, ji myš stejně dojede, takže se po chvíli hledá objížďka.
        if (!hunted() && (options[0].blocker === 'trap' || (options[0].blocker === 'saw' && !daring()))) {
            return options[0];
        }

        return options.find(o => !o.blocker) ?? options[0];
    };

    /** Zastavení se drží stejně jako zatáčení – tak ať se to nezapomene pustit. */
    const brake = on => {
        if (on === game.waiting) return;
        if (on) game.handleAction('wait');
        else game.handleRelease('wait');
    };

    /**
     * Zatáčení se ve hře **drží** (klávesa, prst, náklon), takže ho autopilot
     * musí umět i pustit – jinak by se myš točila pořád dokola.
     */
    const hold = side => {
        if (game.held === side) return;
        if (game.held) game.handleRelease(game.held);
        if (side) game.handleAction(side);
    };

    /** Zamíří čumákem na střed dané buňky. */
    const aimAt = target => {
        const mouse = game.mouse;
        const want = Math.atan2(target.y + 0.5 - mouse.y, target.x + 0.5 - mouse.x);
        const error = angleDiff(mouse.heading, want);

        if (Math.abs(error) < 0.06) hold(null);
        else hold(error > 0 ? 'right' : 'left');
    };

    /**
     * Rozhodnutí se drží aspoň chvilku. Otáčení je pozvolné, takže než se myš
     * stihne otočit k novému cíli, uběhne kus času – a kdyby autopilot měnil
     * názor každý snímek, jen by se na místě kýval.
     */
    let decision = null;
    let decidedAt = -1;
    let decidedIn = null;

    /** Je v téhle buňce zrovna teď (nebo za okamžik) smrt? */
    const deadlyNow = (x, y) => {
        const trap = game.level.trapAt(x, y);
        if (!trap) return false;

        for (let i = 0; i <= 4; i++) {
            const when = game.clock + i * 0.08;
            if (trap === 'snap' && traps.snapClosed(x, y, when)) return true;
            if (trap === 'pit' && traps.pitOpen(x, y, when)) return true;
        }
        return false;
    };

    const steer = () => {
        const mouse = game.mouse;
        const here = key(mouse.cellX, mouse.cellY);

        // Myš se otáčí pozvolna, takže se do vedlejší buňky umí zanést i tam,
        // kam vůbec nemířila – zvlášť při otočce v úzké chodbě. Když je v ní
        // zrovna sklapnuto, je to přednější než jakýkoliv plán: zastav a uhni.
        const touched = [];
        for (const dx of [-0.45, 0.45]) {
            for (const dy of [-0.45, 0.45]) {
                const tx = Math.floor(mouse.x + dx + Math.cos(mouse.heading) * 0.3);
                const ty = Math.floor(mouse.y + dy + Math.sin(mouse.heading) * 0.3);
                if (tx === mouse.cellX && ty === mouse.cellY) continue;
                if (touched.some(t => t.x === tx && t.y === ty)) continue;
                touched.push({x: tx, y: ty});
            }
        }

        const live = touched.find(t => deadlyNow(t.x, t.y));
        if (live) {
            decision = null;
            brake(true);
            aimAt({x: mouse.cellX * 2 - live.x, y: mouse.cellY * 2 - live.y});
            return;
        }

        // Kam se míří, se drží chvíli (jinak by se myš na místě kývala), ale
        // jestli se smí jet, se počítá **každý snímek**: past se otevře na
        // vteřinu a půl a na zastaralé rozhodnutí se ta chvíle prošvihne.
        if (decidedIn !== here || game.clock - decidedAt > 0.4) {
            decision = plan();
            decidedAt = game.clock;
            decidedIn = here;
        }

        if (!decision) {
            brake(true);
            hold(null);
            return;
        }

        // Před zavřenou pastí se stojí a čeká, ale čumák zůstane namířený –
        // jakmile se otevře, stačí se rozeběhnout.
        const when = game.clock
            + Math.hypot(decision.x + 0.5 - mouse.x, decision.y + 0.5 - mouse.y) / game.runSpeed;
        brake(!!blocker(decision.x, decision.y, decision.dir ?? facing(), when));
        aimAt(decision);
    };

    /** Kam teď zamířit: pryč od hrozby, na cestu k východu, nebo do zdi čekat. */
    const plan = () => {
        const mouse = game.mouse;

        // Před pilou ani kočkou se nečeká – od těch se utíká, myš je rychlejší
        if (threatAhead() < 2.8) {
            const away = {x: mouse.cellX - DIRS[facing()][0], y: mouse.cellY - DIRS[facing()][1]};
            if (game.level.isFree(away.x, away.y) && hasWayOut(away.x, away.y, back(facing()))) return away;
        }

        return chooseGoal();
    };

    const samples = [];
    const recent = [];   // posledních pár desetin sekundy kvůli rozboru smrti

    for (let frame = 0; frame * dt < seconds; frame++) {
        steer();
        game.update(dt);
        elapsed += dt;

        if (trace && frame % Math.round(0.1 / dt) === 0) {
            const mouse = game.mouse;
            const cell = `${mouse.cellX},${mouse.cellY}`;
            const trap = game.level.trapAt(mouse.cellX, mouse.cellY);
            const shut = trap === 'snap' ? traps.snapClosed(mouse.cellX, mouse.cellY, game.clock)
                : trap === 'pit' ? traps.pitOpen(mouse.cellX, mouse.cellY, game.clock) : false;
            recent.push(`${elapsed.toFixed(1)}s myš ${mouse.x.toFixed(2)},${mouse.y.toFixed(2)} (${cell}` +
                `${trap ? ' ' + trap + (shut ? ' ZAVŘENO' : ' otevřeno') : ''})` +
                ` směr ${(mouse.heading * 57.3).toFixed(0)}°${mouse.stalled ? ' stojí' : ''}` +
                `${game.waiting ? ' čeká' : ''}` +
                ` cíl ${decision ? `${decision.x},${decision.y}` : '-'} drží ${game.held ?? '-'}`);
            if (recent.length > 25) recent.shift();
        }
        if (trace && frame % Math.round(0.5 / dt) === 0) {
            const mouse = game.mouse;
            samples.push(`${elapsed.toFixed(1)}s ${mouse.cellX},${mouse.cellY}` +
                `${mouse.stalled ? ' stojí' : ''} k východu ${game.level.distanceToExit(mouse.cellX, mouse.cellY)}`);
        }

        if (game.progress > bestProgress + 0.001) {
            bestProgress = game.progress;
            stuckFor = 0;
        } else {
            stuckFor += dt;
        }

        // Pořád dokola před tímtéž místem? Tak tudy cesta nevede.
        if (stuckFor > 8) {
            const mouse = game.mouse;
            giveUpOn(mouse.cellX + DIRS[facing()][0], mouse.cellY + DIRS[facing()][1]);
            stuckFor = 0;
        }

        if (game.state === 'complete') {
            return {ok: true, seconds: +elapsed.toFixed(1), deaths, cheese: game.cheeseTaken, samples};
        }
        if (game.state === 'dead') {
            deaths++;
            bestProgress = 0;
            stuckFor = 0;

            const grave = key(game.mouse.cellX, game.mouse.cellY);
            graves.set(grave, (graves.get(grave) ?? 0) + 1);
            if (graves.get(grave) >= 2) giveUpOn(game.mouse.cellX, game.mouse.cellY);

            if (deaths > maxDeaths) {
                const mouse = game.mouse;
                const near = dangers()
                    .map(d => `${d.constructor.name} ${d.x.toFixed(1)},${d.y.toFixed(1)}`)
                    .join(' | ');
                return {
                    ok: false,
                    why: `zemřela ${deaths}× (naposledy: ${game.cause} v ${mouse.cellX},${mouse.cellY}; ${near})`,
                    deaths,
                    samples: [...samples, '--- poslední dvě vteřiny ---', ...recent],
                };
            }

            game.retry();
            replan();
        }
    }

    return {
        ok: false,
        why: `nedoběhla do ${seconds} s (postup ${Math.round(game.progress * 100)} %)`,
        deaths,
        samples: [...samples, '--- poslední dvě vteřiny ---', ...recent],
    };
}

const args = process.argv.slice(2);
const only = args.includes('--level') ? Number(args[args.indexOf('--level') + 1]) : null;
const headed = args.includes('--headed');
const trace = args.includes('--trace');   // vypíše, kudy autopilot běžel

const {chromium} = createRequire(import.meta.url)('playwright');
const server = await serve();
const port = server.address().port;
const browser = await chromium.launch({headless: !headed, executablePath: process.env.CHROME || undefined});
const page = await browser.newPage({viewport: {width: 960, height: 540}});

const failures = [];
page.on('pageerror', e => failures.push(`chyba stránky: ${e.message}`));
await page.goto(`http://127.0.0.1:${port}/`, {waitUntil: 'networkidle'});

const count = await page.evaluate(() => window.labyrinth.levels.length);
for (let index = 0; index < count; index++) {
    if (only && index + 1 !== only) continue;

    const result = await page.evaluate(playInPage, [index, 1 / 120, 360, 8, trace]);
    if (result.ok) {
        console.log(`level ${index + 1}: venku za ${result.seconds} s, ${result.deaths}× smrt, sýr ${result.cheese}`);
    } else {
        console.error(`level ${index + 1}: SELHAL – ${result.why}`);
        if (trace) for (const line of result.samples) console.error(`    ${line}`);
        failures.push(`level ${index + 1}: ${result.why}`);
    }
}

await browser.close();
server.close();

if (failures.length) {
    console.error(`\n${failures.length} selhání:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
}
console.log('\nvšechny levely prošly');
