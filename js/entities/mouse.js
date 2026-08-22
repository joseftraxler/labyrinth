import {Entity} from "./entity.js";
import {DIRS, TAU, angleDiff, dirAngle} from "../draw.js";
import {MOUSE_RADIUS, PACE_RATE, TURN_MAX, TURN_RATE} from "../physics.js";

/**
 * Bílá myš, kterou hráč řídí. **Běží pořád rovně před sebe** a hráč jí jen
 * otáčí – nakloněním telefonu, drženou šipkou nebo prstem na kraji obrazovky.
 * Otáčení je plynulé (`TURN_RATE`), takže se labyrint stáčí přesně tak dlouho,
 * jak dlouho hráč drží; myš se nikde neotočí sama.
 *
 * Když má před sebou zeď, **běží na místě**. Je to tím pádem taky jediný způsob,
 * jak počkat před pastí – a ve slepé uličce se dá v klidu otočit o 180°, protože
 * otáčení na běhu nezávisí.
 *
 * Do zdi se myš jen zapře: náraz nezabíjí. Šikmý dotyk stěnu obklouzne, takže
 * se chodbou dá běžet i s čumákem trochu mimo osu – jinak by se hráč musel
 * trefovat do osy chodby na desetiny stupně.
 *
 * Myš o hře nic neví: nesbírá sýr, neumírá ani nekončí level. Jen běží a hlásí
 * `stalled`, když se nehne z místa. Co to znamená, rozhoduje `Game`.
 */
export class Mouse extends Entity {
    reset() {
        super.reset();

        this.heading = dirAngle(this.firstWayOut());
        this.turning = 0;        // násobek TURN_RATE: záporně doleva, kladně doprava
        this.braking = false;    // hráč drží „stůj“
        this.pace = 1;           // rozjetost 0–1, brzda ji stahuje k nule
        this.speed = 0;
        this.stalled = false;    // zapřená do zdi
    }

    /**
     * Kterým směrem z doupěte vede chodba – ať hra nezačíná čelem do zdi.
     * Metoda je schválně veřejná: volá se z `reset()`, tedy ještě z konstruktoru
     * předka, kde soukromé metody podtřídy neexistují.
     */
    firstWayOut() {
        for (let dir = 0; dir < 4; dir++) {
            const d = DIRS[dir];
            if (this.game.level.isFree(this.spawnX + d.x, this.spawnY + d.y)) return dir;
        }
        return 0;
    }

    /**
     * Otáčení od hráče. Číslo je **násobek `TURN_RATE`**: záporné doleva,
     * kladné doprava, nula rovně. Šipka i prst posílají plnou jedničku, náklon
     * telefonu tolik, kolik odpovídá jeho sklonu – proto to není přepínač.
     * Drží se: dokud chodí nenulové číslo, labyrint se stáčí.
     */
    steer(turn) {
        this.turning = Math.max(-TURN_MAX, Math.min(TURN_MAX, turn || 0));
    }

    /**
     * Zastavení. Myš se zapře a čichá na místě, dokud hráč drží – je to jediný
     * způsob, jak počkat před pastí, protože otáčení běh nezastaví. Rozjezd
     * i zastavení chvilku trvají (`PACE_RATE`), takže to není přepínač, ale
     * zabrždění.
     */
    brake(on) {
        this.braking = on;
    }

    step(dt) {
        super.step(dt);

        const want = this.braking ? 0 : 1;
        const change = PACE_RATE * dt;
        this.pace += Math.max(-change, Math.min(change, want - this.pace));

        this.#turn(dt);
        this.#run(dt);
    }

    /** Otáčení. Jde i na místě – zastavená myš se může v klidu otočit. */
    #turn(dt) {
        this.heading += this.turning * TURN_RATE * dt;
    }

    /**
     * Běh vpřed s klouzáním po zdech. Osy se řeší zvlášť – díky tomu myš, která
     * míří šikmo do stěny, sklouzne podél ní místo aby se zastavila, a zastaví
     * se až tam, kde je zeď opravdu proti ní.
     */
    #run(dt) {
        const step = this.speed * this.pace * dt;
        if (step <= 1e-6) {
            this.stalled = false;
            return;
        }

        const fromX = this.x;
        const fromY = this.y;

        this.x = this.#slide(this.x, Math.cos(this.heading) * step, this.y, true);
        this.y = this.#slide(this.y, Math.sin(this.heading) * step, this.x, false);

        this.stalled = Math.hypot(this.x - fromX, this.y - fromY) < step * 0.3;
    }

    /**
     * Posun po jedné ose s dorazem o zeď. `other` je poloha na druhé ose –
     * tělíčko je kulaté, takže se musí zkontrolovat všechny buňky, které
     * napříč protíná.
     *
     * Ptá se na `blocks`, ne na `isWall`: dokud v labyrintu zbývá sýr, je
     * zavřená mříž východu zeď jako každá jiná – a náraz do ní se ohlásí
     * stejným `stalled` jako náraz do kamene.
     */
    #slide(value, delta, other, horizontal) {
        if (delta === 0) return value;

        const r = MOUSE_RADIUS;
        const next = value + delta;
        const edge = delta > 0 ? next + r : next - r;
        const cell = Math.floor(edge);

        const first = Math.floor(other - r + 1e-6);
        const last = Math.floor(other + r - 1e-6);

        for (let across = first; across <= last; across++) {
            const wall = horizontal
                ? this.game.level.blocks(cell, across)
                : this.game.level.blocks(across, cell);
            if (!wall) continue;

            // doraz přesně o stěnu buňky, o zlomek pixelu dál, ať se nezasekne
            return delta > 0 ? cell - r - 1e-4 : cell + 1 + r + 1e-4;
        }

        return next;
    }

    /**
     * Doběh do ráje za východem. Venku už žádné zdi nejsou, takže se nekontrolují
     * – myš jen doběhne mezi sýry a mezi nimi se zastaví. Volá to `Game`, když
     * je level dohraný; sama od sebe myš ven nevybíhá.
     */
    runFree(dt, heading) {
        const turn = angleDiff(this.heading, heading);
        const most = TURN_RATE * dt;
        this.heading += Math.max(-most, Math.min(most, turn));

        this.animPhase += dt;
        this.pace = Math.max(0, this.pace - PACE_RATE * 0.16 * dt);
        this.stalled = false;

        const step = this.speed * this.pace * dt;
        this.x += Math.cos(this.heading) * step;
        this.y += Math.sin(this.heading) * step;
    }

    /**
     * Myš se kreslí čumákem k ose +x; o natočení se stará kontext, který dostane
     * od hry. Běh je vidět na nožkách a ocásku – fáze se počítá z `animPhase`,
     * takže se nožky střídají i při běhu na místě.
     */
    draw(ctx, cx, cy, size) {
        const gait = this.animPhase * 13;
        const wag = Math.sin(gait * 0.5) * (0.06 + 0.1 * this.pace);
        const resting = this.stalled || this.pace < 0.4;
        const sniff = resting ? Math.sin(this.animPhase * 16) * 0.02 : 0;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this.heading);
        ctx.scale(size, size);

        // ocásek – táhne se za tělem a kmitá při běhu
        ctx.strokeStyle = '#f2a7c3';
        ctx.lineWidth = 0.045;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-0.26, 0);
        ctx.quadraticCurveTo(-0.42, wag * 1.6, -0.56, -wag * 2.2);
        ctx.stroke();

        // nožky
        ctx.strokeStyle = '#e7a0bd';
        ctx.lineWidth = 0.055;
        for (const side of [-1, 1]) {
            for (const [ox, phase] of [[-0.12, 0], [0.12, Math.PI]]) {
                const swing = Math.sin(gait + phase + (side > 0 ? Math.PI : 0)) * 0.07 * Math.max(0.15, this.pace);
                ctx.beginPath();
                ctx.moveTo(ox, side * 0.11);
                ctx.lineTo(ox + swing, side * 0.2);
                ctx.stroke();
            }
        }

        // tělo
        ctx.fillStyle = '#fdfdfb';
        ctx.beginPath();
        ctx.ellipse(-0.05, 0, 0.26, 0.17, 0, 0, TAU);
        ctx.fill();

        // ouška
        ctx.fillStyle = '#fdfdfb';
        ctx.strokeStyle = '#e7a0bd';
        ctx.lineWidth = 0.03;
        for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.ellipse(0.07, side * 0.16, 0.11, 0.10, 0, 0, TAU);
            ctx.fill();
            ctx.stroke();
        }

        // hlava s čumákem
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(0.32 + sniff, 0);
        ctx.quadraticCurveTo(0.20, 0.16, 0.02, 0.13);
        ctx.quadraticCurveTo(-0.02, 0, 0.02, -0.13);
        ctx.quadraticCurveTo(0.20, -0.16, 0.32 + sniff, 0);
        ctx.fill();

        // fousky
        ctx.strokeStyle = 'rgba(80, 80, 90, 0.75)';
        ctx.lineWidth = 0.014;
        for (const side of [-1, 1]) {
            for (const tilt of [-0.06, 0.05]) {
                ctx.beginPath();
                ctx.moveTo(0.28, side * 0.05);
                ctx.lineTo(0.46 + sniff, side * 0.14 + tilt);
                ctx.stroke();
            }
        }

        // očka a nosík
        ctx.fillStyle = '#20222c';
        for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.arc(0.14, side * 0.08, 0.032, 0, TAU);
            ctx.fill();
        }
        ctx.fillStyle = '#f2748f';
        ctx.beginPath();
        ctx.arc(0.33 + sniff, 0, 0.028, 0, TAU);
        ctx.fill();

        ctx.restore();
    }
}
