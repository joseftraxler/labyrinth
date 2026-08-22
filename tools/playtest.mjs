/**
 * Automatický průchod všemi levely v opravdovém prohlížeči.
 *
 * Skript spustí hru v Chromiu a nechá labyrinty proběhnout **autopilotem**:
 * v každém rozcestí se podívá, kterým směrem je to k východu blíž, a než tam
 * pošle myš, ověří, jestli tam v tu chvíli nebude sklapnutá past, pila nebo
 * kočka. Když to nikam nejde, otočí myš zpátky a zkusí to znovu – přesně jako
 * hráč. Hraje se **skutečným kódem hry** (`Game.update`), takže test odhalí
 * jak rozbitý pohyb, tak neprůchodný level.
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

    // Kde už myš umřela. Autopilot i hra jsou deterministické, takže bez téhle
    // paměti by každý další pokus dopadl přesně stejně – takhle se místu, kde
    // to nevyšlo, příště vyhne, jako by si to hráč zapamatoval.
    const graves = new Map();

    /**
     * Buňky, kterými cesta nevede, i když jsou průchozí: chodba, ve které
     * pila jezdí sem a tam, nebo místo, kde se to už dvakrát nepovedlo.
     * Kdyby je autopilot jen odmítal na místě, čekal by před nimi donekonečna –
     * takhle si kolem nich rovnou spočítá cestu jinudy.
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

    /** Vede od myši k východu cesta i s obcházením? */
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

    /**
     * Odepíše místo, kde to nejde, a přepočítá cestu; u pily rovnou celou její
     * chodbu. Když by se tím cesta k východu ztratila úplně, odepsání se vezme
     * zpátky – projít tudy je pořád lepší než stát.
     */
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
    const daring = () => stuckFor > 3;

    // Když ani obcházení nepomůže, přestane autopilot pilám uhýbat a zkusí to.
    // Umřít a zkusit to jinudy je pořád lepší výsledek testu než stát na místě.
    const reckless = () => stuckFor > 12;

    /** Všechno, co se hýbe a zabíjí. */
    const dangers = () => [...game.saws, ...game.cats];

    /** Je myši kočka v patách? Pak se před pastí nedá čekat, musí se objíždět. */
    const hunted = () => game.cats.some(cat => {
        const far = Math.hypot(cat.x - game.mouse.x, cat.y - game.mouse.y);
        return far < 3 || (cat.chase > 0 && far < 7);
    });

    /** Co brání vběhnout do téhle buňky (`null` = nic). */
    const blocker = (x, y, dir, t) => {
        if (!safe(x, y, t)) return game.level.trapAt(x, y) ? 'trap' : 'cat';
        if (!reckless() && !runSafe(x, y, dir, t)) return 'saw';
        return null;
    };

    /** Je bezpečné být v téhle buňce kolem času `t`? (pasti a kočky) */
    const safe = (x, y, t) => {
        const trap = game.level.trapAt(x, y);
        const reach = 0.6 / game.runSpeed;

        for (let i = -4; i <= 4; i++) {
            const when = t + i * reach / 4;
            if (when < 0) continue;
            if (trap === 'snap' && traps.snapClosed(x, y, when)) return false;
            if (trap === 'pit' && traps.pitOpen(x, y, when)) return false;
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
                // Myš a pila se k sobě blíží až osmi buňkami za vteřinu, takže
                // se vzorkuje hustě – jinak by se minutí prosmýklo mezi vzorky
                for (let i = -2; i <= 3; i++) {
                    const at = saw.positionAt(when + i * 0.05);
                    if (Math.hypot(at.x - cx - 0.5, at.y - cy - 0.5) < 1.0) return false;
                }
            }

            // Za odbočkou se rozhoduje znovu, takže dál dopředu se dívat nemá
            // smysl – ale první tři buňky se prohlédnou vždycky, jinak by se do
            // chodby s pilou vbíhalo přes křižovatku poslepu.
            if (k > 2 && game.level.exits(cx, cy) > 2) break;
        }
        return true;
    };

    /** Jak daleko je nejbližší hrozba v daném směru od myši (Infinity = žádná). */
    const threatIn = dir => {
        const mouse = game.mouse;
        const step = DIRS[dir];
        let closest = Infinity;

        for (const danger of dangers()) {
            const dx = danger.x - mouse.x;
            const dy = danger.y - mouse.y;
            const along = dx * step[0] + dy * step[1];
            const aside = Math.abs(dx * step[1] - dy * step[0]);
            if (along > 0 && aside < 0.7) closest = Math.min(closest, along);
        }
        return closest;
    };

    /**
     * Otočka má smysl, jen když za zády nic nečíhá – jinak myš vběhne do klína.
     * Nesmí ani vycouvat do sklapnuté pasti: couvá se okamžitě, takže se to
     * musí ohlídat tady, ne až v `choose`.
     */
    const canReverse = (urgent = false) => {
        const mouse = game.mouse;
        if (threatIn(back(mouse.dir)) <= 3) return false;

        const bx = mouse.cx - DIRS[mouse.from][0];
        const by = mouse.cy - DIRS[mouse.from][1];
        if (!game.level.isFree(bx, by)) return true;

        // Když je pila na dosah, je past za zády pořád lepší volba: do pily se
        // vbíhá jistě, past má aspoň chvíli, kdy je natažená. Jinak musí být
        // buňka za zády bezpečná po celou dobu popoběhnutí tam a zpátky –
        // čekat se dá jenom na místě, kde pod myší nic nesklapne.
        if (!urgent) {
            for (let i = 0; i <= 5; i++) {
                if (!safe(bx, by, game.clock + i * 0.12)) return false;
            }
        }

        return hasWayOut(bx, by, back(mouse.from));
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

        // Chodbou se jde i za roh, takže se únik hledá po ní, ne po přímce –
        // jinak by autopilot považoval každou zatáčku za slepou uličku.
        for (let k = 0; k < 9; k++) {
            if (!game.level.isFree(cx, cy)) return false;
            if (game.level.isExit(cx, cy)) return true;   // ven je ta nejlepší cesta ven

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

    /**
     * Kterým směrem z buňky dál. Autopilot drží nejkratší cestu k východu
     * a **před zavřenou pastí radši čeká, než aby ji objížděl**: popoběhne
     * o buňku zpátky a vrátí se – tím se posune do jiné chvíle a past ho pustí.
     * Objížďka se hledá jen před kočkou, protože ta se sama pohne a čekat na ni
     * nemá smysl.
     */
    const choose = (x, y, incoming, arrival) => {
        const reversing = back(incoming);
        const behind = !canReverse();
        const when = arrival + 1 / game.runSpeed;
        const options = [];

        for (let dir = 0; dir < 4; dir++) {
            const nx = x + DIRS[dir][0];
            const ny = y + DIRS[dir][1];
            if (!game.level.isFree(nx, ny)) continue;
            if (dir === reversing && behind) continue;

            const dist = distanceOut(nx, ny);
            if (dist < 0) continue;

            // Otočka stojí zhruba buňku cesty; místo, kde už myš umřela, stojí
            // podstatně víc – hra i autopilot jsou deterministické, takže bez
            // téhle přirážky by každý další pokus dopadl stejně.
            const cost = dist
                + (dir === reversing ? 1.5 : 0)
                + 8 * (graves.get(`${nx},${ny}`) ?? 0);
            options.push({dir, cost, nx, ny, blocker: blocker(nx, ny, dir, when)});
        }

        if (!options.length) return behind ? incoming : reversing;
        options.sort((a, b) => a.cost - b.cost);

        if (!options[0].blocker) return options[0].dir;

        // Past se za chvíli natáhne, takže se před ní čeká. Pilu jde přečkat
        // taky – ale ne vždycky: myš je rychlejší než ona, takže ji v chodbě
        // dojede zezadu, a chodbu, kterou pila projíždí celou, se prostě musí
        // obejít. Proto se čeká jen chvíli a pak se hledá objížďka.
        if (!behind && !hunted() &&
            (options[0].blocker === 'trap' || (options[0].blocker === 'saw' && !daring()))) {
            return reversing;
        }

        const open = options.find(o => !o.blocker);
        return open ? open.dir : (behind ? incoming : reversing);
    };

    /**
     * Otočka je okamžitá, takže ji nesmí autopilot poslat dvakrát po sobě –
     * to by myš na místě jen kmitala a nikdy by z buňky nevyjela. Mezi dvěma
     * otočkami proto musí uběhnout aspoň kousek chodby.
     */
    /**
     * Zatáčení se ve hře **drží** (klávesa, prst, náklon), takže ho autopilot
     * musí umět i pustit – jinak by myš zahýbala dál i potom, co už dávno chce
     * jet rovně.
     */
    const hold = side => {
        if (game.held === side) return;
        if (game.held) game.handleRelease(game.held);
        if (side) game.handleAction(side);
    };

    let lastTurnBack = -1;
    const turnBack = (urgent = false) => {
        // Otočka na záchranu života smí přijít kdykoliv – ale jen když myš mezi
        // dvěma otočkami kus popoběhla. Jinak by se dvě nástrahy proti sobě
        // přetahovaly o myš, která by mezi nimi kmitala na místě.
        const moved = game.mouse.off > 0.25;
        if (!(urgent && moved) && game.clock - lastTurnBack < 0.3) return;

        lastTurnBack = game.clock;
        hold(null);
        game.handleAction('back');
    };

    const steer = () => {
        const mouse = game.mouse;
        if (mouse.stalled) {
            turnBack();
            return;
        }

        // Před pilou ani kočkou se nečeká – od těch se utíká, myš je rychlejší
        const threat = threatIn(mouse.dir);
        if (threat < 2.8 && canReverse(threat < 2.0)) {
            turnBack(true);
            return;
        }

        // Otočka jde kdykoliv – myš se vrátí po svém oblouku, takže se čeká
        // před pastí popobíháním tam a zpátky, ne stáním na místě
        const now = choose(mouse.cx, mouse.cy, mouse.from, game.clock);
        if (now === back(mouse.dir)) {
            turnBack();
            return;
        }

        const nx = mouse.cx + DIRS[mouse.dir][0];
        const ny = mouse.cy + DIRS[mouse.dir][1];
        // Buňka se přebíhá od hranice k hranici, takže doprostřed té další je
        // to o půl buňky dál, než kolik zbývá do konce téhle
        const arrival = game.clock + (1.5 - mouse.off) / game.runSpeed;

        // Buňka, do které se myš právě řítí, se mezitím mohla stát pastí –
        // otočka je okamžitá, takže se z ní dá vycouvat i mimo střed
        // Tahle otočka zachraňuje život, takže se na klid mezi otočkami nehledí
        if (!safe(nx, ny, arrival) && canReverse()) {
            turnBack(true);
            return;
        }

        // Zatáčka se hlásí dopředu – myš si ji podrží do příští křižovatky
        const want = choose(nx, ny, mouse.dir, arrival);
        const turn = (want - mouse.dir + 4) % 4;

        if (turn === 1) hold('right');
        else if (turn === 3) hold('left');
        else hold(null);            // rovně: pustit dřív ohlášenou zatáčku
    };

    const samples = [];
    const recent = [];   // posledních pár desetin sekundy kvůli rozboru smrti

    for (let frame = 0; frame * dt < seconds; frame++) {
        steer();
        game.update(dt);
        elapsed += dt;

        if (trace && frame % Math.round(0.1 / dt) === 0) {
            const mouse = game.mouse;
            const ax = mouse.cx + DIRS[mouse.dir][0];
            const ay = mouse.cy + DIRS[mouse.dir][1];
            // Buňka se přebíhá od hranice k hranici, takže doprostřed té další je
        // to o půl buňky dál, než kolik zbývá do konce téhle
        const arrival = game.clock + (1.5 - mouse.off) / game.runSpeed;
            const options = [0, 1, 2, 3]
                .filter(d => game.level.isFree(mouse.cx + DIRS[d][0], mouse.cy + DIRS[d][1]))
                .map(d => `${d}:${distanceOut(mouse.cx + DIRS[d][0], mouse.cy + DIRS[d][1])}` +
                    `${blocker(mouse.cx + DIRS[d][0], mouse.cy + DIRS[d][1], d, game.clock + 1 / game.runSpeed) ?? ''}`)
                .join(' ');
            recent.push(`${elapsed.toFixed(1)}s buňka ${mouse.cx},${mouse.cy} [${options}] stuck=${stuckFor.toFixed(1)}` +
                ` myš ${mouse.x.toFixed(1)},${mouse.y.toFixed(1)} dir${mouse.dir}` +
                ` off=${mouse.off.toFixed(2)} vpřed ${ax},${ay} (${game.level.trapAt(ax, ay) ?? '-'})` +
                ` bezpečno=${safe(ax, ay, arrival)} příjezd=${arrival.toFixed(2)}` +
                ` hrozba ${threatIn(mouse.dir).toFixed(1)} couvnout=${canReverse(true)}`);
            if (recent.length > 25) recent.shift();
        }
        if (trace && frame % Math.round(0.5 / dt) === 0) {
            const mouse = game.mouse;
            samples.push(`${elapsed.toFixed(1)}s ${mouse.cellX},${mouse.cellY} dir${mouse.dir}` +
                `${mouse.stalled ? ' stojí' : ''} k východu ${game.level.distanceToExit(mouse.cellX, mouse.cellY)}`);
        }

        if (game.progress > bestProgress + 0.001) {
            bestProgress = game.progress;
            stuckFor = 0;
        } else {
            stuckFor += dt;
        }

        // Pořád dokola před tímtéž místem? Tak tudy cesta nevede.
        if (stuckFor > 5) {
            const mouse = game.mouse;
            giveUpOn(mouse.cx + DIRS[mouse.dir][0], mouse.cy + DIRS[mouse.dir][1]);
            stuckFor = 0;
        }

        if (game.state === 'complete') {
            return {ok: true, seconds: +elapsed.toFixed(1), deaths, cheese: game.cheeseTaken, samples};
        }
        if (game.state === 'dead') {
            deaths++;
            bestProgress = 0;
            stuckFor = 0;

            const grave = `${game.mouse.cellX},${game.mouse.cellY}`;
            graves.set(grave, (graves.get(grave) ?? 0) + 1);
            if (graves.get(grave) >= 2) giveUpOn(game.mouse.cellX, game.mouse.cellY);
            if (deaths > maxDeaths) {
                const mouse = game.mouse;
                const near = dangers()
                    .map(d => `${d.constructor.name} ${d.x.toFixed(1)},${d.y.toFixed(1)}`)
                    .join(' | ');
                return {
                    ok: false,
                    why: `zemřela ${deaths}× (naposledy: ${game.cause} v ${mouse.cellX},${mouse.cellY}` +
                        `, směr ${mouse.dir}; ${near})`,
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
