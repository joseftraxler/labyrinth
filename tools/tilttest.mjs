/**
 * Ověří ovládání nakláněním telefonu.
 *
 * Čidlo náklonu se v prohlížeči nedá zmáčknout jako klávesa, takže se tady
 * emuluje přes Chrome DevTools Protocol (`Emulation.setDeviceOrientationOverride`) –
 * hra dostane úplně stejné události `deviceorientation` jako na telefonu.
 * Test pak jen počítá, kolikrát myš zahnula doleva a doprava.
 *
 * Kontroluje čtyři věci, na kterých ovládání náklonem stojí:
 *   1. náklon doprava stáčí labyrint doprava, doleva doleva,
 *   2. **rychlost otáčení odpovídá míře náklonu** – 22,5° základní rychlost,
 *      45° dvojnásobek a víc už ne,
 *   3. drobné chvění rukou (pod prahem) neotáčí vůbec,
 *   4. **klidová poloha se bere při zapnutí** – když hráč drží telefon
 *      nakloněný, hra z toho nesmí zatáčet.
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

/**
 * Odehraje kus levelu a změří, o kolik se za tu dobu myš (a s ní labyrint)
 * stočila. Otáčení je plynulé, takže se nepočítají zatáčky, ale stupně:
 * kladné doprava, záporné doleva.
 */
function runInPage(seconds) {
    const game = window.labyrinth;

    game.levelIndex = 0;
    game.loadLevel();
    game.state = 'playing';

    const start = game.mouse.heading;
    const dt = 1 / 120;

    for (let frame = 0; frame * dt < seconds; frame++) {
        game.update(dt);
        if (game.state !== 'playing') game.retry();
    }

    return Math.round((game.mouse.heading - start) * 57.3);
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

// 2. bez náklonu (přepínač vypnutý) se myš neotáčí vůbec
const plain = await page.evaluate(runInPage, 12);
check('bez ovládání se myš neotáčí', plain === 0, `${plain}°`);

// 3. zapnutí přepínače v klidové poloze a náklon doprava / doleva
await page.evaluate(() => window.labyrinth.handleAction('tilt'));
await page.waitForTimeout(100);
check('přepínač náklon zapnul', await page.evaluate(() => window.labyrinth.tilt.enabled));

// Kolik stupňů se za `seconds` stočí při základní rychlosti (js/physics.js)
const {TURN_RATE} = await page.evaluate(async () => {
    const physics = await import('./js/physics.js');
    return {TURN_RATE: physics.TURN_RATE};
});
const base = TURN_RATE * 57.3 * 12;
const near = (value, want) => Math.abs(value - want) < Math.abs(want) * 0.08;

await tilt(0, 22.5);
await page.waitForTimeout(150);
const right = await page.evaluate(runInPage, 12);
check('22,5° doprava = základní rychlost', near(right, base), `${right}° proti ${Math.round(base)}°`);

await tilt(0, -22.5);
await page.waitForTimeout(150);
const left = await page.evaluate(runInPage, 12);
check('22,5° doleva = základní rychlost na druhou stranu', near(left, -base), `${left}°`);

await tilt(0, 45);
await page.waitForTimeout(150);
const full = await page.evaluate(runInPage, 12);
check('45° otáčí dvakrát rychleji', near(full, 2 * base), `${full}° proti ${Math.round(2 * base)}°`);

await tilt(0, 70);
await page.waitForTimeout(150);
const over = await page.evaluate(runInPage, 12);
check('nad 45° už se nezrychluje', near(over, 2 * base), `${over}° proti ${Math.round(2 * base)}°`);

// mezi body odezva plynule roste, není to přepínač
await tilt(0, 13.75);
await page.waitForTimeout(150);
const half = await page.evaluate(runInPage, 12);
check('mírný náklon otáčí pomaleji', near(half, base / 2), `${half}° proti ${Math.round(base / 2)}°`);

// 4. drobné chvění (pod prahem) nesmí zatáčet
await tilt(0, 4);
await page.waitForTimeout(150);
const steady = await page.evaluate(runInPage, 12);
check('chvění pod pěti stupni neotáčí vůbec', steady === 0, `${steady}°`);

// 5. klidová poloha se bere při zapnutí – nakloněný telefon nezatáčí
await page.evaluate(() => window.labyrinth.handleAction('tilt'));   // vypnout
await tilt(0, 30);                                                  // takhle ho hráč drží
await page.waitForTimeout(150);
await page.evaluate(() => window.labyrinth.handleAction('tilt'));   // a teď zapnout
await page.waitForTimeout(150);
const held = await page.evaluate(runInPage, 12);
check('nakloněný telefon se srovná při zapnutí', held === 0, `${held}°`);

await browser.close();
server.close();

if (failures.length) {
    console.error(`\n${failures.length} selhání: ${failures.join(', ')}`);
    process.exit(1);
}
console.log('\nnáklon funguje');
