import {Level} from "./level.js";
import {Mouse} from "./entities/mouse.js";
import {Cat} from "./entities/cat.js";
import {Saw} from "./entities/saw.js";
import {Sound} from "./audio.js";
import {Haptics} from "./haptics.js";
import {Tilt} from "./tilt.js";
import {actionForEvent, buildKeyMap} from "./input.js";
import {themeFor} from "./themes/registry.js";
import {DIRS, TAU, noise, roundRect} from "./draw.js";
import {BASE_SPEED, CAT_HIT, MOUSE_HIT, SAW_HIT, SIGHT} from "./physics.js";
import {pitLid, pitOpen, snapArm, snapClosed} from "./traps.js";

// Výška horního pruhu HUD v pixelech
const HUD = 54;

// Kolik buněk labyrintu se vejde přes kratší stranu obrazovky. Menší číslo =
// větší přiblížení; z labyrintu má být vidět jen okolí myši, ne celá mapa.
const VIEW_CELLS = 9;

// Šířka pruhu pro přepínač v rohu HUD (ikona i dotyková plocha)
const ICON_ZONE = 44;

// Kam na obrazovce patří myš. Vodorovně doprostřed, svisle níž – před sebe
// (nahoru) musí být vidět víc než za sebe.
const VIEW_Y = 0.62;

// Kolik podob má dlaždice podlahy a zdi (vybírá se podle souřadnic buňky)
const TILE_VARIANTS = 8;

// Největší strana minimapy v pixelech a její odstup od rohu
const MAP_MAX = 150;
const MAP_PAD = 10;

export class Game {
    constructor(canvas, levels, controls) {
        this.c = canvas;
        this.ctx = canvas.getContext('2d');
        this.levels = levels;
        this.keyMap = buildKeyMap(controls);

        this.sound = new Sound();
        this.haptics = new Haptics();
        this.tilt = new Tilt();
        this.held = null;           // zatáčení, které hráč právě drží
        this.waiting = false;       // hráč drží „stůj“

        this.levelIndex = 0;
        this.score = 0;
        this.attempt = 1;
        this.best = 0;

        this.tile = 32;
        this.floorTiles = [];
        this.wallTiles = [];
        this.particles = [];
        this.visible = new Map();   // klíč buňky → vzdálenost od myši po chodbě
        this.seen = new Set();      // kudy už myš v tomhle pokusu prošla

        this.loadLevel();
        this.resize();
        this.bindInput();
        this.bindPointer();
        window.addEventListener('resize', () => this.resize());

        this.last = 0;
        requestAnimationFrame(t => this.loop(t));
    }

    /**
     * Načte aktuální level znovu od začátku. Level se pokaždé rozparsuje
     * nanovo, takže se po smrti obnoví i sebraný sýr.
     */
    loadLevel() {
        const source = this.levels[this.levelIndex];
        this.level = new Level({speed: source.speed, theme: source.theme}, ...source.rows);
        this.theme = themeFor(this.level.theme, this);
        this.#dropStaleCaches();   // dlaždice patří tématu, ne hře
        this.runSpeed = BASE_SPEED * this.level.speed / 100;

        this.mouse = new Mouse(this, this.level.start.x, this.level.start.y);
        this.mouse.speed = this.runSpeed;
        this.cats = this.level.catSpawns.map(spawn => new Cat(this, spawn.x, spawn.y));
        this.saws = this.level.sawSpawns.map(spawn => new Saw(this, spawn));

        this.state = 'ready';       // ready | playing | paused | dead | complete | won
        this.clock = 0;             // odehraný čas levelu (pasti se řídí jím)
        this.prevClock = 0;
        this.cheeseTaken = 0;
        this.progress = 0;
        this.particles.length = 0;
        this.camHeading = this.mouse.heading;
        this.seen.clear();
        this.mapSeen = null;
        this.updateVisibility(true);

        this.sound.setTrack(this.theme.audio(), this.levelIndex);
    }

    // ---- Ovládání ----

    bindInput() {
        window.addEventListener('keydown', e => {
            const action = actionForEvent(this.keyMap, e);
            if (!action) return;
            e.preventDefault();
            if (!e.repeat) this.handleAction(action);
        });

        // Zatáčení se **drží** – puštěná klávesa musí zatáčení hned ukončit
        window.addEventListener('keyup', e => {
            const action = actionForEvent(this.keyMap, e);
            if (action) this.handleRelease(action);
        });
    }

    /**
     * Klávesy, dotyk i myš vedou sem – logika ovládání je na jednom místě.
     * `left`/`right`/`back` jsou **relativní k myši**, ne ke světové straně:
     * labyrint se pod myší otáčí, ale „doleva“ znamená doleva vždycky.
     */
    handleAction(action) {
        this.sound.unlock();

        switch (action) {
            case 'mute':
                this.sound.toggle();
                return;
            case 'haptics':
                this.haptics.toggle();
                return;
            case 'tilt':
                // Povolení k čidlu si iOS říká jen z dotyku, proto až tady
                this.tilt.toggle();
                return;
            case 'restart':
                this.retry();
                return;
            case 'pause':
                if (this.state === 'playing') this.state = 'paused';
                else if (this.state === 'paused') this.state = 'playing';
                this.sound.setMusicOn(this.state === 'playing');
                return;
        }

        // Ostatní akce (zatáčení) rozjedou hru i posunou ji z koncových stavů
        switch (this.state) {
            case 'ready':
                this.state = 'playing';
                this.sound.setMusicOn(true);
                break;
            case 'paused':
                this.state = 'playing';
                this.sound.setMusicOn(true);
                return;
            case 'dead':
                this.retry();
                return;
            case 'complete':
                this.nextLevel();
                return;
            case 'won':
                this.restartGame();
                return;
        }

        if (this.state !== 'playing') return;

        // Všechno se drží: zatáčení stáčí labyrint, dokud hráč drží, a „stůj“
        // myš zastaví, dokud drží. Ťuknutí je jen krátké držení.
        if (action === 'wait') this.waiting = true;
        else this.held = action;
    }

    /** Puštění klávesy nebo prstu – zatáčení i stání skončí. */
    handleRelease(action) {
        if (action === 'wait') this.waiting = false;
        if (this.held === action) this.held = null;
    }

    /**
     * Dotyk a myš. Horní pruh = pauza (jeho pravý roh zvuk, pruh vedle
     * vibrace), zbytek plochy je rozdělený na tři svislé pásy: krajní zatáčejí,
     * prostřední otočí myš zpátky. Zóny jsou svislé schválně – v otáčejícím se
     * labyrintu hráč přemýšlí v „doleva/doprava“, ne ve světových stranách.
     */
    bindPointer() {
        const holds = new Map();    // prst (nebo myš) → co drží

        const at = (px, py) => {
            const w = this.w;

            if (py < HUD) {
                const zones = this.toggles();
                const index = Math.floor((w - px) / ICON_ZONE);
                return index < zones.length ? zones[index] : 'pause';
            }

            if (px < w * 0.3) return 'left';
            if (px > w * 0.7) return 'right';
            return 'wait';
        };

        const press = (id, px, py) => {
            const action = at(px, py);
            holds.set(id, action);
            this.handleAction(action);
        };

        const release = id => {
            const action = holds.get(id);
            if (!action) return;
            holds.delete(id);
            this.handleRelease(action);
        };

        this.c.addEventListener('mousedown', e => {
            e.preventDefault();
            press('mouse', e.clientX, e.clientY);
        });
        window.addEventListener('mouseup', () => release('mouse'));

        this.c.addEventListener('touchstart', e => {
            e.preventDefault();
            for (const touch of e.changedTouches) press(touch.identifier, touch.clientX, touch.clientY);
        }, {passive: false});
        for (const name of ['touchend', 'touchcancel']) {
            this.c.addEventListener(name, e => {
                e.preventDefault();
                for (const touch of e.changedTouches) release(touch.identifier);
            }, {passive: false});
        }

        this.c.addEventListener('contextmenu', e => e.preventDefault());
    }

    /**
     * Přepínače v pravém rohu HUD, zprava doleva. Je to jediné místo, kde se
     * jejich pořadí určuje – kreslení i ťukání se ptá tady, takže ikona sedí do
     * stejného pruhu, do jakého se ťuká.
     */
    toggles() {
        const zones = ['mute'];
        if (this.haptics.supported) zones.push('haptics');
        if (this.tilt.supported) zones.push('tilt');
        return zones;
    }

    /** Zvuk a vibrace k jedné události – ať se to nikde nerozejde. */
    feedback(name) {
        this.sound.play(name);
        this.haptics.play(name);
    }

    // ---- Průběh hry ----

    retry() {
        this.attempt++;
        const best = this.best;
        this.loadLevel();
        this.best = best;
        this.state = 'playing';
        this.sound.setMusicOn(true);
    }

    nextLevel() {
        if (this.levelIndex + 1 >= this.levels.length) {
            this.state = 'won';
            this.feedback('win');
            this.sound.setMusicOn(false);
            return;
        }

        this.levelIndex++;
        this.attempt = 1;
        this.best = 0;
        this.loadLevel();
    }

    restartGame() {
        this.levelIndex = 0;
        this.attempt = 1;
        this.best = 0;
        this.score = 0;
        this.loadLevel();
    }

    die(cause) {
        if (this.state !== 'playing') return;
        this.state = 'dead';
        this.best = Math.max(this.best, this.progress);
        this.cause = cause;
        this.spawnPuff();
        this.feedback('death');
        this.sound.setMusicOn(false);
    }

    escaped() {
        this.state = 'complete';
        this.best = 1;
        this.progress = 1;
        this.score += this.cheeseTaken * 10 + 50;
        this.feedback('complete');
        this.sound.setMusicOn(false);
    }

    // ---- Plátno ----

    resize() {
        this.dpr = window.devicePixelRatio || 1;
        const w = window.innerWidth;
        const h = window.innerHeight;

        this.c.width = Math.round(w * this.dpr);
        this.c.height = Math.round(h * this.dpr);
        this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        this.w = w;
        this.h = h;

        const tile = Math.max(18, Math.min(w, h - HUD) / VIEW_CELLS);
        if (Math.abs(tile - this.tile) > 0.5) {
            this.tile = tile;
            this.#dropStaleCaches();
        }

        // Minimapa se počítá z rozměru okna, takže se překresluje při každé
        // změně velikosti – i takové, na které je velikost buňky ještě stejná.
        this.mapBase = null;
        this.mapSeen = null;
    }

    /**
     * Předkreslené dlaždice platí pro **téma a velikost buňky** – při změně
     * kteréhokoliv z toho se musí zahodit, jinak by kuchyně vypadala jako
     * katakomby.
     */
    #dropStaleCaches() {
        this.floorTiles.length = 0;
        this.wallTiles.length = 0;
        this.mapBase = null;
        this.mapSeen = null;
    }

    // ---- Smyčka ----

    loop(now) {
        const dt = Math.min((now - this.last) / 1000 || 0, 0.05);
        this.last = now;

        this.update(dt);
        this.render();

        requestAnimationFrame(t => this.loop(t));
    }

    update(dt) {
        // Kamera dojíždí i ve stavu `ready`, ať je natočení hned správně
        this.camHeading = this.mouse.heading;
        this.updateParticles(dt);

        if (this.state !== 'playing') return;

        this.prevClock = this.clock;
        this.clock += dt;

        // Zatáčení se drží: klávesa, prst na kraji obrazovky nebo náklon
        // telefonu. Dokud hráč drží, labyrint se pod myší stáčí; jakmile pustí,
        // myš běží rovně dál – proto se posílá i nula.
        //
        // Klávesa a prst otáčejí plnou rychlostí, náklon podle svého sklonu.
        // Držené tlačítko má přednost: kdo drží kraj obrazovky, chce zatáčet
        // bez ohledu na to, jak zrovna telefon svírá.
        const button = this.held === 'left' ? -1 : this.held === 'right' ? 1 : 0;
        this.mouse.steer(button || this.tilt.read());
        this.mouse.brake(this.waiting);

        const stalled = this.mouse.stalled;
        this.mouse.speed = this.runSpeed;
        this.mouse.step(dt);
        if (this.mouse.stalled && !stalled) this.feedback('bump');

        for (const saw of this.saws) saw.step(dt);
        for (const cat of this.cats) {
            const hunted = cat.chase > 0;
            cat.step(dt);
            if (cat.chase > 0 && !hunted) this.feedback('meow');
        }

        this.updateVisibility();
        this.hearTraps();
        this.collectCheese();

        const dist = this.level.distanceToExit(this.mouse.cellX, this.mouse.cellY);
        if (dist >= 0 && this.level.startDist > 0) {
            this.progress = Math.max(0, Math.min(1, 1 - dist / this.level.startDist));
        }

        const cause = this.deadly();
        if (cause) {
            this.die(cause);
            return;
        }

        if (this.level.isExit(this.mouse.cellX, this.mouse.cellY)) this.escaped();
    }

    /**
     * Co myš právě zabíjí (a nic, když nic). Pasti se měří od středu buňky,
     * kočka a pila vzdáleností – kulaté překážky mají menší hitbox než buňka,
     * ať hra odpouští těsné proběhnutí.
     */
    deadly() {
        const trap = this.level.trapAt(this.mouse.cellX, this.mouse.cellY);
        if (trap) {
            const dx = this.mouse.x - (this.mouse.cellX + 0.5);
            const dy = this.mouse.y - (this.mouse.cellY + 0.5);
            const inside = Math.abs(dx) < 0.44 && Math.abs(dy) < 0.44;

            if (inside && trap === 'snap' && snapClosed(this.mouse.cellX, this.mouse.cellY, this.clock)) return 'trap';
            if (inside && trap === 'pit' && pitOpen(this.mouse.cellX, this.mouse.cellY, this.clock)) return 'pit';
        }

        for (const saw of this.saws) {
            if (this.touches(saw, SAW_HIT)) return 'saw';
        }
        for (const cat of this.cats) {
            if (this.touches(cat, CAT_HIT)) return 'cat';
        }
        return null;
    }

    touches(entity, radius) {
        const dx = entity.x - this.mouse.x;
        const dy = entity.y - this.mouse.y;
        const reach = radius + MOUSE_HIT;
        return dx * dx + dy * dy < reach * reach;
    }

    collectCheese() {
        if (this.level.takeCheese(this.mouse.cellX, this.mouse.cellY)) {
            this.cheeseTaken++;
            this.feedback('cheese');
        }
    }

    /** Sklapnutí pasti opodál je slyšet – varování, že se blíží ta pravá chvíle. */
    hearTraps() {
        for (const [key, dist] of this.visible) {
            if (dist > 4) continue;
            const x = key % this.level.width;
            const y = (key - x) / this.level.width;
            if (this.level.trapAt(x, y) !== 'snap') continue;
            if (snapClosed(x, y, this.clock) && !snapClosed(x, y, this.prevClock)) this.sound.play('snap');
        }
    }

    /**
     * Kam myš dohlédne. Měří se **po chodbách**, ne vzdušnou čarou, takže za
     * roh je vidět jen tam, kam vede cesta – z toho vzniká celý pocit hry:
     * labyrint není vidět, jen kus okolo myši.
     */
    updateVisibility(force = false) {
        const cx = this.mouse.cellX;
        const cy = this.mouse.cellY;
        if (!force && cx === this.seenX && cy === this.seenY) return;

        this.seenX = cx;
        this.seenY = cy;
        this.visible.clear();

        const width = this.level.width;
        const queue = [{x: cx, y: cy, d: 0}];
        this.visible.set(cy * width + cx, 0);

        for (let head = 0; head < queue.length; head++) {
            const cell = queue[head];
            if (cell.d >= SIGHT) continue;

            for (const d of DIRS) {
                const x = cell.x + d.x;
                const y = cell.y + d.y;
                const key = y * width + x;
                if (this.level.isWall(x, y) || this.visible.has(key)) continue;

                this.visible.set(key, cell.d + 1);
                queue.push({x, y, d: cell.d + 1});
            }
        }

        // Do minimapy se prokreslí jen to nové – projít celý labyrint v každém
        // snímku by bylo dražší než celý zbytek kresby dohromady.
        for (const key of this.visible.keys()) {
            if (this.seen.has(key)) continue;
            this.seen.add(key);
            this.paintSeen(key);
        }
    }

    /** Jak silně je buňka osvětlená (0 = tma, 1 = přímo u myši). */
    light(x, y) {
        const dist = this.visible.get(y * this.level.width + x);
        if (dist === undefined) return 0;
        return Math.max(0, 1 - (dist / SIGHT) ** 1.6);
    }

    /** Nejjasnější sousední buňka – podle ní se osvětlují zdi. */
    wallLight(x, y) {
        let best = 0;
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                best = Math.max(best, this.light(x + dx, y + dy));
            }
        }
        return best;
    }

    spawnPuff() {
        for (let i = 0; i < 22; i++) {
            const angle = Math.random() * TAU;
            const speed = 1 + Math.random() * 3;
            this.particles.push({
                x: this.mouse.x,
                y: this.mouse.y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 0.5 + Math.random() * 0.4,
                age: 0,
            });
        }
    }

    updateParticles(dt) {
        for (const p of this.particles) {
            p.age += dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vx *= 0.90;
            p.vy *= 0.90;
        }
        this.particles = this.particles.filter(p => p.age < p.life);
    }

    // ---- Vykreslení ----

    /** Kde na obrazovce myš stojí – z toho se počítá kamera, světlo i tma. */
    get viewX() {
        return this.w / 2;
    }

    get viewY() {
        return (this.h - HUD) * VIEW_Y + HUD;
    }

    /** Vodorovná souřadnice buňky v pixelech světa (bez kamery). */
    px(x) {
        return x * this.tile;
    }

    py(y) {
        return y * this.tile;
    }

    render() {
        const ctx = this.ctx;
        ctx.fillStyle = this.theme.background();
        ctx.fillRect(0, 0, this.w, this.h);

        ctx.save();
        this.applyCamera();
        this.drawWorld();
        ctx.restore();

        this.drawLamp();

        this.drawFog();
        this.theme.drawAir(ctx);
        this.drawMinimap();
        this.drawHud();
        this.drawOverlay();
    }

    /**
     * Kamera jako navigace v autě: myš je pořád na stejném místě obrazovky
     * a míří vzhůru, otáčí se labyrint kolem ní.
     */
    applyCamera() {
        const ctx = this.ctx;
        ctx.translate(this.viewX, this.viewY);
        ctx.rotate(-Math.PI / 2 - this.camHeading);
        ctx.translate(-this.px(this.mouse.x), -this.py(this.mouse.y));
    }

    drawWorld() {
        const ctx = this.ctx;
        const tile = this.tile;

        // Podlaha a zdi kolem ní. Kreslí se jen to, na co myš dohlédne –
        // zbytek labyrintu je tma.
        for (const [key, dist] of this.visible) {
            const x = key % this.level.width;
            const y = (key - x) / this.level.width;
            const px = this.px(x);
            const py = this.py(y);

            ctx.globalAlpha = Math.max(0, 1 - (dist / SIGHT) ** 1.6);
            ctx.drawImage(this.floorTile(x, y), px, py, tile, tile);

            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (!this.level.isWall(x + dx, y + dy)) continue;
                    ctx.drawImage(this.wallTile(x + dx, y + dy), px + dx * tile, py + dy * tile, tile, tile);
                }
            }
        }

        ctx.globalAlpha = 1;
        this.drawItems();
        this.drawActors();
        this.drawParticles();
    }

    /** Sýr, pasti, doupě a východ – všechno, co leží v mapě. */
    drawItems() {
        const ctx = this.ctx;
        const tile = this.tile;

        for (const [key] of this.visible) {
            const x = key % this.level.width;
            const y = (key - x) / this.level.width;
            const cx = this.px(x + 0.5);
            const cy = this.py(y + 0.5);
            const light = this.light(x, y);
            if (light <= 0.02) continue;

            ctx.globalAlpha = light;

            if (this.level.isExit(x, y)) this.theme.drawExit(ctx, cx, cy, tile);
            if (x === this.level.start.x && y === this.level.start.y) this.theme.drawDen(ctx, cx, cy, tile);

            const trap = this.level.trapAt(x, y);
            if (trap === 'snap') {
                this.theme.drawSnap(ctx, cx, cy, tile, snapArm(x, y, this.clock));
            } else if (trap === 'pit') {
                this.theme.drawPit(ctx, cx, cy, tile, pitLid(x, y, this.clock));
            }

            if (this.level.hasCheese(x, y)) {
                this.theme.drawCheese(ctx, cx, cy, tile, this.clock + noise(key) * TAU);
            }
        }

        ctx.globalAlpha = 1;
    }

    drawActors() {
        const ctx = this.ctx;
        const tile = this.tile;

        for (const saw of this.saws) {
            const light = this.light(Math.floor(saw.x), Math.floor(saw.y));
            if (light <= 0.02) continue;
            ctx.globalAlpha = light;
            saw.draw(ctx, this.px(saw.x), this.py(saw.y), tile);
            this.theme.decorateSaw(ctx, this.px(saw.x), this.py(saw.y), tile);
        }

        for (const cat of this.cats) {
            const light = this.light(cat.cellX, cat.cellY);
            if (light <= 0.02) continue;
            ctx.globalAlpha = light;
            cat.draw(ctx, this.px(cat.x), this.py(cat.y), tile);
        }

        ctx.globalAlpha = 1;
        if (this.state !== 'dead') this.mouse.draw(ctx, this.px(this.mouse.x), this.py(this.mouse.y), tile);
    }

    drawParticles() {
        const ctx = this.ctx;
        for (const p of this.particles) {
            const t = 1 - p.age / p.life;
            ctx.globalAlpha = t * 0.8;
            ctx.fillStyle = '#e8e8ee';
            ctx.beginPath();
            ctx.arc(this.px(p.x), this.py(p.y), this.tile * 0.09 * (1.4 - t), 0, TAU);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    /**
     * Teplé světlo kolem myši. Kreslí se **přes hotový svět a bez otáčení**:
     * je to světlo, které myš nese s sebou, ne kus mapy – proto se s labyrintem
     * neotáčí a nesmí být v dlaždicích.
     */
    drawLamp() {
        const ctx = this.ctx;
        const cx = this.viewX;
        const cy = this.viewY;
        const radius = this.tile * 2.6;

        const lamp = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        lamp.addColorStop(0, 'rgba(255, 236, 196, 0.16)');
        lamp.addColorStop(1, 'rgba(255, 236, 196, 0)');

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = lamp;
        ctx.fillRect(0, 0, this.w, this.h);
        ctx.restore();
    }

    /** Tma kolem dosvitu – bez ní by okraj vykreslené části byl vidět jako řez. */
    drawFog() {
        const ctx = this.ctx;
        const cx = this.viewX;
        const cy = this.viewY;
        const radius = SIGHT * this.tile;

        const fog = ctx.createRadialGradient(cx, cy, radius * 0.16, cx, cy, radius);
        fog.addColorStop(0, 'rgba(0, 0, 0, 0)');
        fog.addColorStop(0.55, 'rgba(0, 0, 0, 0.18)');
        fog.addColorStop(0.85, 'rgba(0, 0, 0, 0.62)');
        fog.addColorStop(1, this.theme.background());

        ctx.fillStyle = fog;
        ctx.fillRect(0, 0, this.w, this.h);
    }

    // ---- Minimapa ----

    /**
     * Plánek celého labyrintu v rohu obrazovky s tečkou, kde je myš. Je to
     * jediné místo ve hře, které se **neotáčí**: podle otáčející se mapy se
     * plánovat nedá a od toho je tady pohled na labyrint shora.
     *
     * Kreslí se ze dvou předkreslených obrázků – celý labyrint slabě a přes něj
     * to, kudy už myš prošla. Znovu se překreslují jen při změně velikosti nebo
     * levelu; v každém snímku je to tím pádem dvakrát `drawImage` a dvě tečky,
     * ne tisíc obdélníčků.
     */
    drawMinimap() {
        const ctx = this.ctx;
        const cell = this.mapCell();
        const w = cell * this.level.width;
        const h = cell * this.level.height;
        const x = this.w - w - MAP_PAD;
        const y = HUD + MAP_PAD;

        ctx.save();

        // podklad, ať je plánek čitelný i nad světlou podlahou
        ctx.fillStyle = 'rgba(8, 10, 20, 0.72)';
        ctx.strokeStyle = 'rgba(233, 237, 255, 0.18)';
        ctx.lineWidth = 1;
        roundRect(ctx, x - 5, y - 5, w + 10, h + 10, 6);
        ctx.fill();
        ctx.stroke();

        ctx.drawImage(this.mapPlan(), x, y);
        ctx.drawImage(this.mapTrail(), x, y);

        // východ – bliká, aby bylo poznat, kam se běží
        const exit = this.level.exit;
        ctx.fillStyle = `rgba(255, 226, 150, ${0.55 + 0.45 * Math.sin(this.clock * 3)})`;
        ctx.fillRect(x + exit.x * cell - 1, y + exit.y * cell - 1, cell + 2, cell + 2);

        // doupě, ze kterého se vyběhlo – kvůli orientaci, kde je střed
        const den = this.level.start;
        ctx.strokeStyle = 'rgba(233, 237, 255, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x + (den.x + 0.5) * cell, y + (den.y + 0.5) * cell, Math.max(2, cell * 0.9), 0, TAU);
        ctx.stroke();

        // myš i s tím, kam je otočená – na plánku je sever nahoře, ve hře ne,
        // takže bez čárky by hráč nevěděl, kterým směrem se vlastně žene
        const mx = x + this.mouse.x * cell;
        const my = y + this.mouse.y * cell;
        const dot = Math.max(2, cell * 0.7);

        ctx.strokeStyle = 'rgba(8, 10, 20, 0.9)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(mx, my);
        ctx.lineTo(mx + Math.cos(this.mouse.heading) * dot * 2.6, my + Math.sin(this.mouse.heading) * dot * 2.6);
        ctx.stroke();

        ctx.strokeStyle = '#7df9c6';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = 'rgba(8, 10, 20, 0.9)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(mx, my, dot, 0, TAU);
        ctx.fill();
        ctx.stroke();

        ctx.restore();
    }

    /** Kolik pixelů má na minimapě jedna buňka. */
    mapCell() {
        const room = Math.min(this.w * 0.28, (this.h - HUD) * 0.34, MAP_MAX);
        return Math.max(2, Math.floor(room / Math.max(this.level.width, this.level.height)));
    }

    #mapCanvas() {
        const cell = this.mapCell();
        const canvas = document.createElement('canvas');
        canvas.width = cell * this.level.width;
        canvas.height = cell * this.level.height;
        return canvas;
    }

    /** Celý labyrint slabě – tvar chodeb, ve kterém myš ještě nebyla. */
    mapPlan() {
        if (this.mapBase) return this.mapBase;

        const cell = this.mapCell();
        this.mapBase = this.#mapCanvas();
        const ctx = this.mapBase.getContext('2d');

        ctx.fillStyle = 'rgba(233, 237, 255, 0.13)';
        for (let y = 0; y < this.level.height; y++) {
            for (let x = 0; x < this.level.width; x++) {
                if (this.level.isFree(x, y)) ctx.fillRect(x * cell, y * cell, cell, cell);
            }
        }
        return this.mapBase;
    }

    /** Chodby, které už myš viděla. Přikresluje se po jedné buňce za běhu. */
    mapTrail() {
        if (this.mapSeen) return this.mapSeen;

        this.mapSeen = this.#mapCanvas();
        for (const key of this.seen) this.paintSeen(key);
        return this.mapSeen;
    }

    paintSeen(key) {
        if (!this.mapSeen) return;

        const cell = this.mapCell();
        const x = key % this.level.width;
        const y = (key - x) / this.level.width;

        const ctx = this.mapSeen.getContext('2d');
        ctx.fillStyle = 'rgba(125, 249, 198, 0.55)';
        ctx.fillRect(x * cell, y * cell, cell, cell);
    }

    // ---- Předkreslené dlaždice ----

    floorTile(x, y) {
        const variant = Math.floor(noise(x * 3.7 + y * 11.3) * TILE_VARIANTS);
        if (!this.floorTiles[variant]) this.floorTiles[variant] = this.bake(variant, false);
        return this.floorTiles[variant];
    }

    wallTile(x, y) {
        const variant = Math.floor(noise(x * 5.1 + y * 7.9) * TILE_VARIANTS);
        if (!this.wallTiles[variant]) this.wallTiles[variant] = this.bake(variant, true);
        return this.wallTiles[variant];
    }

    /**
     * Dlaždice se kreslí jednou a pak už jen kopírují – rasterizace je
     * nejdražší část snímku a podlahu se zdmi je vidět v každém.
     */
    bake(variant, wall) {
        const size = Math.ceil(this.tile);
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;

        const ctx = canvas.getContext('2d');
        if (wall) this.theme.paintWall(ctx, size, variant);
        else this.theme.paintFloor(ctx, size, variant);

        return canvas;
    }

    // ---- HUD a překryv ----

    drawHud() {
        const ctx = this.ctx;
        const w = this.w;
        const pad = 12;

        ctx.fillStyle = 'rgba(8, 10, 20, 0.78)';
        ctx.fillRect(0, 0, w, HUD);

        // pruh postupu k východu
        const barX = pad + 26;
        const icons = this.toggles().length * ICON_ZONE;
        const barW = Math.max(60, w - barX - pad - icons);
        const barY = HUD - 13;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
        roundRect(ctx, barX, barY, barW, 6, 3);
        ctx.fill();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.30)';
        roundRect(ctx, barX, barY, Math.max(barW * this.best, 6), 6, 3);
        ctx.fill();

        ctx.fillStyle = '#7df9c6';
        roundRect(ctx, barX, barY, Math.max(barW * this.progress, 6), 6, 3);
        ctx.fill();

        // pauza
        ctx.fillStyle = '#e9edff';
        if (this.state === 'paused') {
            ctx.beginPath();
            ctx.moveTo(pad, 12);
            ctx.lineTo(pad + 14, 19);
            ctx.lineTo(pad, 26);
            ctx.closePath();
            ctx.fill();
        } else {
            ctx.fillRect(pad, 12, 5, 15);
            ctx.fillRect(pad + 8, 12, 5, 15);
        }

        // texty – když se nevejdou, ubírají se po stupních
        ctx.font = '600 15px system-ui, sans-serif';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#e9edff';

        const room = w - barX - icons - pad;
        const cheese = `SÝR ${this.cheeseTaken}/${this.level.cheeseCount}`;
        const attempt = `POKUS ${this.attempt}`;
        const label = `LEVEL ${this.levelIndex + 1}`;

        ctx.textAlign = 'left';
        ctx.fillText(label, barX, 18);
        const used = ctx.measureText(label).width;

        ctx.textAlign = 'right';
        if (used + ctx.measureText(cheese).width + 24 < room) {
            ctx.fillText(cheese, barX + barW, 18);
        }

        ctx.textAlign = 'center';
        const middle = barX + barW / 2;
        if (used + ctx.measureText(cheese).width + ctx.measureText(attempt).width + 60 < room) {
            ctx.fillText(attempt, middle, 18);
        }

        this.drawToggles();
    }

    /**
     * Přepínače v rohu HUD. Pořadí i počet drží `toggles()`, takže ikona sedí
     * přesně do pruhu, do kterého se ťuká; ikony, pro které zařízení nemá
     * čidlo (vibrace, náklon), se nekreslí ani neťukají.
     */
    drawToggles() {
        const ctx = this.ctx;
        const cy = HUD / 2 - 3;

        ctx.lineWidth = 2;
        ctx.lineCap = 'butt';

        this.toggles().forEach((zone, index) => {
            const x = this.w - (index + 0.5) * ICON_ZONE;
            ctx.strokeStyle = '#e9edff';
            ctx.fillStyle = '#e9edff';

            if (zone === 'mute') this.#drawSoundIcon(x, cy);
            if (zone === 'haptics') this.#drawPhoneIcon(x, cy, this.haptics.enabled, false);
            if (zone === 'tilt') this.#drawPhoneIcon(x, cy, this.tilt.enabled, true);
        });

        ctx.globalAlpha = 1;
    }

    #drawSoundIcon(x, cy) {
        const ctx = this.ctx;

        ctx.beginPath();
        ctx.moveTo(x - 9, cy - 4);
        ctx.lineTo(x - 5, cy - 4);
        ctx.lineTo(x, cy - 9);
        ctx.lineTo(x, cy + 9);
        ctx.lineTo(x - 5, cy + 4);
        ctx.lineTo(x - 9, cy + 4);
        ctx.closePath();
        ctx.fill();

        if (this.sound.muted) {
            ctx.beginPath();
            ctx.moveTo(x + 3, cy - 6);
            ctx.lineTo(x + 11, cy + 6);
            ctx.moveTo(x + 11, cy - 6);
            ctx.lineTo(x + 3, cy + 6);
            ctx.stroke();
            return;
        }

        ctx.beginPath();
        ctx.arc(x + 1, cy, 7, -0.9, 0.9);
        ctx.stroke();
    }

    /**
     * Telefon: buď s vlnkami (vibrace), nebo nakloněný se šipkou (ovládání
     * náklonem). Vypnutý přepínač je zašedlý a přeškrtnutý – aby bylo poznat,
     * že tam čidlo je, ale nepoužívá se.
     */
    #drawPhoneIcon(x, cy, on, tilted) {
        const ctx = this.ctx;

        ctx.globalAlpha = on ? 1 : 0.4;
        ctx.save();
        ctx.translate(x, cy);
        if (tilted) ctx.rotate(-0.35);
        roundRect(ctx, -5, -9, 10, 18, 2);
        ctx.stroke();
        ctx.restore();

        if (tilted) {
            // oblouček se šipkou, kterým se telefon naklání
            ctx.beginPath();
            ctx.arc(x, cy, 13, -2.5, -0.7);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(x + 9, cy - 9);
            ctx.lineTo(x + 12, cy - 5);
            ctx.lineTo(x + 6, cy - 5);
            ctx.closePath();
            ctx.fill();
        } else if (on) {
            for (const side of [-1, 1]) {
                ctx.beginPath();
                ctx.arc(x, cy, 11, side > 0 ? -0.6 : Math.PI - 0.6, side > 0 ? 0.6 : Math.PI + 0.6);
                ctx.stroke();
            }
        }

        if (!on) {
            ctx.beginPath();
            ctx.moveTo(x - 10, cy - 10);
            ctx.lineTo(x + 10, cy + 10);
            ctx.stroke();
        }

        ctx.globalAlpha = 1;
    }

    drawOverlay() {
        if (this.state === 'playing') return;

        const ctx = this.ctx;
        const cx = this.w / 2;
        const cy = this.h / 2;

        ctx.fillStyle = 'rgba(6, 8, 16, 0.72)';
        ctx.fillRect(0, 0, this.w, this.h);

        const lines = this.overlayText();

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        ctx.font = '700 30px system-ui, sans-serif';
        ctx.fillText(lines[0], cx, cy - 34);

        ctx.font = '400 16px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(233, 237, 255, 0.86)';
        for (let i = 1; i < lines.length; i++) {
            ctx.fillText(lines[i], cx, cy + 4 + (i - 1) * 24);
        }
    }

    overlayText() {
        const deaths = {
            trap: 'Sklaplo to.',
            pit: 'Propadla ses.',
            saw: 'Pila byla rychlejší.',
            cat: 'Kočka tě dostala.',
        };

        switch (this.state) {
            case 'ready':
                return [
                    `Level ${this.levelIndex + 1}${this.theme.name() ? ' – ' + this.theme.name() : ''}`,
                    'Myš běží sama, ty jí říkáš jen kudy.',
                    this.tilt.enabled
                        ? 'Nakláněním telefonu otáčíš celý labyrint'
                        : 'Drž ← → nebo kraj obrazovky a labyrint se stáčí',
                    this.tilt.supported && !this.tilt.enabled
                        ? 'Ikonou telefonu se zapne zatáčení nakláněním'
                        : 'Mezerníkem nebo středem obrazovky myš zastavíš',
                ];
            case 'paused':
                return ['Pauza', 'Pokračuj klávesou nebo ťuknutím'];
            case 'dead':
                return [
                    deaths[this.cause] ?? 'Konec pokusu.',
                    `Nejdál to bylo na ${Math.round(this.best * 100)} % cesty ven`,
                    'Znovu klávesou, ťuknutím nebo R',
                ];
            case 'complete':
                return [
                    'Venku!',
                    `Sýr ${this.cheeseTaken}/${this.level.cheeseCount} · skóre ${this.score}`,
                    'Dál klávesou nebo ťuknutím',
                ];
            case 'won':
                return [
                    'Všechny labyrinty za tebou!',
                    `Skóre ${this.score}`,
                    'Od začátku klávesou nebo ťuknutím',
                ];
            default:
                return [''];
        }
    }
}
