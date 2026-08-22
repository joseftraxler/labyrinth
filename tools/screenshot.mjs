/**
 * Náhledy hry do `docs/`. Spustí hru v Chromiu, přetočí ji na zadaný level,
 * chvíli si ho nechá odehrát autopilotem z `playtest.mjs` (ať myš stojí někde
 * v labyrintu a ne na startu) a uloží obrázek.
 *
 * Vyžaduje Node.js a balíček `playwright` (`npm i -D playwright`).
 *
 * Použití:
 *     node tools/screenshot.mjs                 # náhled ze všech světů
 *     node tools/screenshot.mjs --level 4       # jen jeden
 */
import {createServer} from 'node:http';
import {readFile, mkdir} from 'node:fs/promises';
import {dirname, extname, join, normalize} from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const MIME = {
    '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
    '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
};

// Které levely se fotí a jak se bude obrázek jmenovat (jeden za každý svět)
const SHOTS = [
    {level: 1, name: 'preview', seconds: 6},
    {level: 2, name: 'cellar', seconds: 5},
    {level: 3, name: 'kitchen', seconds: 5},
    {level: 4, name: 'sewer', seconds: 5},
];

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
 * Odehraje level pevným krokem – jednodušeji než playtest: myš míří na
 * sousední buňku, která je k východu nejblíž, a nástrahy neřeší. Na fotku to
 * stačí, nemá to nikam doběhnout.
 */
function runInPage([levelIndex, dt, seconds]) {
    const game = window.labyrinth;
    const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

    game.levelIndex = levelIndex;
    game.loadLevel();
    game.state = 'playing';

    for (let frame = 0; frame * dt < seconds; frame++) {
        const mouse = game.mouse;
        let goal = null;
        let closest = Infinity;

        for (const [dx, dy] of DIRS) {
            const cx = mouse.cellX + dx;
            const cy = mouse.cellY + dy;
            const dist = game.level.distanceToExit(cx, cy);
            if (dist < 0 || dist >= closest) continue;
            closest = dist;
            goal = {x: cx, y: cy};
        }

        if (goal) {
            const want = Math.atan2(goal.y + 0.5 - mouse.y, goal.x + 0.5 - mouse.x) - mouse.heading;
            const error = Math.atan2(Math.sin(want), Math.cos(want));
            const side = Math.abs(error) < 0.08 ? null : (error > 0 ? 'right' : 'left');

            if (game.held !== side) {
                if (game.held) game.handleRelease(game.held);
                if (side) game.handleAction(side);
            }
        }

        game.update(dt);
        if (game.state !== 'playing') game.retry();
    }

    game.render();
}

const args = process.argv.slice(2);
const only = args.includes('--level') ? Number(args[args.indexOf('--level') + 1]) : null;

const {chromium} = createRequire(import.meta.url)('playwright');
const server = await serve();
const port = server.address().port;
const browser = await chromium.launch({executablePath: process.env.CHROME || undefined});
const page = await browser.newPage({viewport: {width: 960, height: 540}, deviceScaleFactor: 2});

await page.goto(`http://127.0.0.1:${port}/`, {waitUntil: 'networkidle'});
await mkdir(join(ROOT, 'docs'), {recursive: true});

for (const shot of SHOTS) {
    if (only && shot.level !== only) continue;

    await page.evaluate(runInPage, [shot.level - 1, 1 / 120, shot.seconds]);
    await page.screenshot({path: join(ROOT, 'docs', `${shot.name}.png`)});
    console.log(`docs/${shot.name}.png (level ${shot.level})`);
}

await browser.close();
server.close();
