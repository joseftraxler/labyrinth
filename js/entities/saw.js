import {Entity} from "./entity.js";
import {TAU} from "../draw.js";
import {SAW_SPEED} from "../physics.js";
import {phase} from "../traps.js";

/**
 * Pila jezdící sem a tam po své chodbě. Její poloha je **čistá funkce místa
 * a herního času** – nic si nepamatuje, nic ji nespouští. Díky tomu ji umí
 * odsimulovat generátor (`tools/gen_mazes.py`) a ověřit, že mezi pilami vede
 * cesta; kdyby reagovala na myš, ověření by přestalo platit.
 *
 * Úsek chodby, po kterém jezdí, spočítá `Level` při parsování mapy (pila si
 * nemá co zjišťovat o světě), fázi si odvodí z výchozí buňky – dvě pily vedle
 * sebe tak nejezdí synchronně.
 */
export class Saw extends Entity {
    constructor(game, spawn) {
        super(game, spawn.x, spawn.y);
        this.axis = spawn.axis;
        this.from = spawn.from;
        this.to = spawn.to;
        this.span = spawn.to - spawn.from;
        this.phase = phase(spawn.x, spawn.y);
        this.place(0);
    }

    reset() {
        super.reset();
        if (this.axis) this.place(0);
    }

    step(dt) {
        super.step(dt);
        this.place(this.game.clock);
    }

    /**
     * Kde pila bude (nebo byla) v daném čase. Je to čistá funkce času, takže se
     * jí dá ptát i na budoucnost – využívá to autopilot v `tools/playtest.mjs`,
     * když počítá, jestli se dá chodbou proběhnout.
     */
    positionAt(clock) {
        const along = this.#along(clock);
        return {
            x: (this.axis === 'x' ? along : this.spawnX) + 0.5,
            y: (this.axis === 'y' ? along : this.spawnY) + 0.5,
        };
    }

    /** Posadí pilu tam, kde v daném čase je. */
    place(clock) {
        const at = this.positionAt(clock);
        this.x = at.x;
        this.y = at.y;
    }

    #along(clock) {
        if (this.span <= 0) return this.from;

        const speed = this.game.runSpeed * SAW_SPEED;
        const period = 2 * this.span / speed;
        const u = ((clock + this.phase * period) % period) * speed;
        return u <= this.span ? this.from + u : this.from + 2 * this.span - u;
    }

    /**
     * Kotouč se zuby. Kreslí se sama a **na hru přitom nesahá** – natočení si
     * počítá z `animPhase`, tedy z odehraného času, ne z hodin hry. Převlek
     * podle prostředí přes ni maluje `Theme.decorateSaw`, kterou volá `Game`.
     */
    draw(ctx, cx, cy, size) {
        const spin = this.animPhase * 9 + this.phase * TAU;
        const r = size * 0.42;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(spin);

        ctx.fillStyle = '#b9c0d4';
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
            const a = i / 10 * TAU;
            ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
            ctx.lineTo(Math.cos(a + TAU / 20) * r * 0.72, Math.sin(a + TAU / 20) * r * 0.72);
        }
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#8b93aa';
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.42, 0, TAU);
        ctx.fill();

        ctx.fillStyle = '#5d6478';
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.14, 0, TAU);
        ctx.fill();

        ctx.restore();
    }
}
