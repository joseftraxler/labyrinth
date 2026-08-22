/**
 * Ověří ovládání nakláněním telefonu.
 *
 * Čidlo náklonu se v prohlížeči nedá zmáčknout jako klávesa, takže se tady
 * emuluje přes Chrome DevTools Protocol (`Emulation.setDeviceOrientationOverride`) –
 * hra dostane úplně stejné události `deviceorientation` jako na telefonu.
 * Test pak jen počítá, kolikrát myš zahnula doleva a doprava.
 *
 * Kontroluje tři věci, na kterých ovládání náklonem stojí:
 *   1. náklon doprava vede myš doprava, doleva doleva,
 *   2. **klidová poloha se bere při zapnutí** – když hráč drží telefon nakloněný,
 *      hra z toho nesmí zatáčet,
 *   3. drobné chvění rukou (pod prahem) myš nerozhodí.
 *
 * Vyžaduje Node.js a balíček `playwright` (`npm i -D playwright`).
 *
 * Použití:
 *     node tools/tilttest.mjs
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

/** Odehraje kus levelu a spočítá, kam myš zahýbala. */
function runInPage(seconds) {
    const game = window.labyrinth;

    game.levelIndex = 0;
    game.loadLevel();
    game.state = 'playing';

    let left = 0;
    let right = 0;
    let dir = game.mouse.dir;

    const dt = 1 / 120;
    for (let frame = 0; frame * dt < seconds; frame++) {
        game.update(dt);
        if (game.state !== 'playing') game.retry();

        if (game.mouse.dir !== dir) {
            const turn = (game.mouse.dir - dir + 4) % 4;
            if (turn === 1) right++;
            if (turn === 3) left++;
            dir = game.mouse.dir;
        }
    }

    return {left, right};
}

const {chromium} = createRequire(import.meta.url)('playwright');
const server = await serve();
const port = server.address().port;
const browser = await chromium.launch({headless: !process.argv.includes('--headed'),
    executablePath: process.env.CHROME || undefined});
const page = await browser.newPage({viewport: {width: 800, height: 480}});
const cdp = await page.context().newCDPSession(page);

/**
 * Nastaví náklon přístroje. Chromium na to má vlastní doménu protokolu; když
 * ji verze prohlížeče nezná, pošle se stránce rovnou událost `deviceorientation`
 * (hra ji zpracuje úplně stejně, jen to nejde přes vrstvu prohlížeče).
 */
let override = true;
const tilt = async (beta, gamma) => {
    if (override) {
        try {
            await cdp.send('DeviceOrientation.setDeviceOrientationOverride', {alpha: 0, beta, gamma});
            return;
        } catch {
            override = false;
        }
    }

    await page.evaluate(([b, g]) => {
        window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', {beta: b, gamma: g, alpha: 0}));
    }, [beta, gamma]);
};

await tilt(0, 0);
await page.goto(`http://127.0.0.1:${port}/`, {waitUntil: 'networkidle'});
await page.waitForTimeout(200);

const failures = [];
const check = (name, ok, detail) => {
    console.log(`${ok ? 'ok  ' : 'CHYBA'} ${name}${detail ? ` – ${detail}` : ''}`);
    if (!ok) failures.push(name);
};

// 1. čidlo se ohlásilo samo, ještě než se přepínač zapnul
const supported = await page.evaluate(() => window.labyrinth.tilt.supported);
check('čidlo náklonu se ohlásilo', supported);

// 2. bez náklonu (přepínač vypnutý) je to výchozí běh chodbami
const plain = await page.evaluate(runInPage, 12);

// 3. zapnutí přepínače v klidové poloze a náklon doprava / doleva
await page.evaluate(() => window.labyrinth.handleAction('tilt'));
await page.waitForTimeout(100);
check('přepínač náklon zapnul', await page.evaluate(() => window.labyrinth.tilt.enabled));

await tilt(0, 25);
await page.waitForTimeout(150);
const right = await page.evaluate(runInPage, 12);
check('náklon doprava vede myš doprava', right.right > right.left,
    `doprava ${right.right}, doleva ${right.left}`);

await tilt(0, -25);
await page.waitForTimeout(150);
const left = await page.evaluate(runInPage, 12);
check('náklon doleva vede myš doleva', left.left > left.right,
    `doleva ${left.left}, doprava ${left.right}`);

// 4. drobné chvění (pod prahem) nesmí zatáčet
await tilt(0, 3);
await page.waitForTimeout(150);
const steady = await page.evaluate(runInPage, 12);
check('chvění pod prahem myš nerozhodí',
    steady.left === plain.left && steady.right === plain.right,
    `${steady.left}/${steady.right} proti ${plain.left}/${plain.right}`);

// 5. klidová poloha se bere při zapnutí – nakloněný telefon nezatáčí
await page.evaluate(() => window.labyrinth.handleAction('tilt'));   // vypnout
await tilt(0, 30);                                                  // takhle ho hráč drží
await page.waitForTimeout(150);
await page.evaluate(() => window.labyrinth.handleAction('tilt'));   // a teď zapnout
await page.waitForTimeout(150);
const held = await page.evaluate(runInPage, 12);
check('nakloněný telefon se srovná při zapnutí',
    held.left === plain.left && held.right === plain.right,
    `${held.left}/${held.right} proti ${plain.left}/${plain.right}`);

await browser.close();
server.close();

if (failures.length) {
    console.error(`\n${failures.length} selhání: ${failures.join(', ')}`);
    process.exit(1);
}
console.log('\nnáklon funguje');
