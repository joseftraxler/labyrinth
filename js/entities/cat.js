import {Runner} from "./runner.js";
import {DIRS, TAU} from "../draw.js";
import {CAT_FORGET, CAT_SIGHT, CAT_SPEED} from "../physics.js";

/**
 * Kočka. Hlídkuje labyrintem a myš, kterou zahlédne rovnou chodbou, se snaží
 * chytit. Je schválně **pomalejší než myš** (`CAT_SPEED`) a vidí kratší kus
 * chodby, než je myší dosvit (`CAT_SIGHT` < `SIGHT`) – hráč tak kočku uvidí
 * dřív než ona jeho a vždycky jí může utéct. Bez těch dvou pravidel by byla
 * kočka nespravedlivá: v uzavřeném labyrintu se před rychlejším pronásledovatelem
 * schovat nedá.
 *
 * Honička nakonec vyprchá (`CAT_FORGET` sekund od chvíle, kdy kočka myš
 * ztratila z očí) a kočka se vrátí k obchůzce. Do hry nesahá – rozhodnutí, že
 * dotyk s kočkou znamená konec pokusu, dělá `Game`.
 */
export class Cat extends Runner {
    reset() {
        this.chase = 0;        // zbývající sekundy honičky
        this.sawMouse = false; // vidí myš právě teď (kvůli zvuku a kresbě)
        super.reset();
    }

    step(dt) {
        this.speed = this.game.runSpeed * CAT_SPEED;

        this.sawMouse = this.#sees();
        if (this.sawMouse) this.chase = CAT_FORGET;
        else this.chase = Math.max(0, this.chase - dt);

        super.step(dt);
    }

    /**
     * Kočka vidí jen rovnou chodbou – za roh ne. Do světa jen nahlíží
     * (`game.level`, poloha myši), nic v něm nemění.
     */
    #sees() {
        const mouse = this.game.mouse;
        if (!mouse) return false;

        const mx = Math.floor(mouse.x);
        const my = Math.floor(mouse.y);
        if (mx !== this.cellX && my !== this.cellY) return false;

        const stepX = Math.sign(mx - this.cellX);
        const stepY = Math.sign(my - this.cellY);
        const far = Math.abs(mx - this.cellX) + Math.abs(my - this.cellY);
        if (far > CAT_SIGHT) return false;

        for (let i = 1; i < far; i++) {
            if (this.game.level.isWall(this.cellX + stepX * i, this.cellY + stepY * i)) return false;
        }
        return true;
    }

    /**
     * Při honičce míří kočka za myší nejkratší cestou po vzdušné čáře – je to
     * hloupé (labyrint umí zahnout jinam), ale právě proto se dá přechytračit.
     * Jinak drží obchůzku: rovně, doprava, doleva.
     */
    chooseDir() {
        // Ve slepé uličce se kočka otočí sama. Myš tam smí uváznout (je to
        // hráčova chyba, ze které se dá vycouvat), kočka ne – zaseknutá kočka
        // by v labyrintu jen stála a přestala být hrozbou.
        if (this.chase <= 0) return this.followCorridor() ?? (this.dir + 2) % 4;

        const mouse = this.game.mouse;
        const options = [];
        for (let dir = 0; dir < 4; dir++) {
            if (!this.free(dir)) continue;
            const d = DIRS[dir];
            const dist = Math.abs(this.cx + d.x + 0.5 - mouse.x) + Math.abs(this.cy + d.y + 0.5 - mouse.y);
            // Otočka uprostřed chodby jen tehdy, když jinudy cesta nevede
            options.push({dir, cost: dist + (dir === (this.dir + 2) % 4 ? 4 : 0)});
        }
        if (!options.length) return (this.dir + 2) % 4;

        options.sort((a, b) => a.cost - b.cost);
        return options[0].dir;
    }

    draw(ctx, cx, cy, size) {
        const gait = this.animPhase * 9;
        const hunt = this.chase > 0;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this.heading);
        ctx.scale(size, size);

        // ocas – při honičce ztuhne dozadu, jinak se líně houpe
        ctx.strokeStyle = '#3b3f52';
        ctx.lineWidth = 0.07;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-0.3, 0);
        const swing = Math.sin(gait * 0.6) * (hunt ? 0.06 : 0.18);
        ctx.quadraticCurveTo(-0.5, swing, -0.6, swing * 2 - 0.1);
        ctx.stroke();

        // tlapky
        ctx.strokeStyle = '#2f3242';
        ctx.lineWidth = 0.07;
        for (const side of [-1, 1]) {
            for (const [ox, ph] of [[-0.14, 0], [0.14, Math.PI]]) {
                const s = Math.sin(gait + ph + (side > 0 ? Math.PI : 0)) * 0.08;
                ctx.beginPath();
                ctx.moveTo(ox, side * 0.13);
                ctx.lineTo(ox + s, side * 0.24);
                ctx.stroke();
            }
        }

        // tělo a hlava
        ctx.fillStyle = '#4a4f66';
        ctx.beginPath();
        ctx.ellipse(-0.06, 0, 0.32, 0.21, 0, 0, TAU);
        ctx.fill();

        // pruhy na hřbetě
        ctx.strokeStyle = '#343849';
        ctx.lineWidth = 0.035;
        for (const ox of [-0.18, -0.04, 0.1]) {
            ctx.beginPath();
            ctx.moveTo(ox, -0.16);
            ctx.lineTo(ox - 0.03, 0.16);
            ctx.stroke();
        }

        ctx.fillStyle = '#535a74';
        ctx.beginPath();
        ctx.arc(0.28, 0, 0.19, 0, TAU);
        ctx.fill();

        // uši
        ctx.fillStyle = '#535a74';
        for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(0.24, side * 0.18);
            ctx.lineTo(0.32, side * 0.05);
            ctx.lineTo(0.4, side * 0.2);
            ctx.closePath();
            ctx.fill();
        }

        // oči – při honičce svítí, jinak jen tak lesknou
        ctx.fillStyle = hunt ? '#ffe14d' : '#a8e06a';
        for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.ellipse(0.34, side * 0.08, 0.055, 0.045, 0, 0, TAU);
            ctx.fill();
        }
        ctx.fillStyle = '#1a1c26';
        for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.ellipse(0.35, side * 0.08, 0.018, 0.04, 0, 0, TAU);
            ctx.fill();
        }

        ctx.restore();
    }
}
