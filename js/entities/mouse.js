import {Runner} from "./runner.js";
import {TAU} from "../draw.js";
import {TURN_BUFFER} from "../physics.js";

/**
 * Bílá myš, kterou hráč řídí. Běží sama a hráč jí říká jen **vlevo / vpravo /
 * zpátky** – v otáčejícím se labyrintu je to jediné, co dává smysl: sever se
 * pod myší pořád stáčí, ale „doleva“ znamená doleva vždycky.
 *
 * Požadavek na zatáčku se pamatuje `TURN_BUFFER` sekund. Bez toho by se musel
 * trefit přesně do křižovatky; s ním stačí říct „vlevo“ o kousek dřív a myš
 * zahne v první odbočce, která se naskytne. Otočka je naopak okamžitá –
 * v slepé uličce není na co čekat.
 *
 * Myš o hře nic neví: nesbírá sýr, neumírá ani nekončí level. Jen běží a hlásí
 * `stalled`, když stojí čelem u zdi. Co to znamená, rozhoduje `Game`.
 */
export class Mouse extends Runner {
    reset() {
        this.pending = null;      // 'left' | 'right'
        this.pendingAge = 0;
        super.reset();
    }

    /** Pokyn od hráče (klávesa, dotyk i myš vedou sem přes `Game.handleAction`). */
    steer(side) {
        if (side === 'back') {
            this.reverse();
            return;
        }
        this.pending = side;
        this.pendingAge = 0;
    }

    step(dt) {
        if (this.pending) {
            this.pendingAge += dt;
            if (this.pendingAge > TURN_BUFFER) this.pending = null;
        }
        super.step(dt);
    }

    chooseDir() {
        if (this.pending) {
            const want = this.pending === 'left' ? (this.dir + 3) % 4 : (this.dir + 1) % 4;
            if (this.free(want)) {
                this.pending = null;
                return want;
            }
        }
        return this.followCorridor();
    }

    /**
     * Myš se kreslí čumákem k ose +x; o natočení se stará kontext, který dostane
     * od hry. Běh je vidět na nožkách a ocásku – fáze se počítá z `animPhase`,
     * takže se nožky střídají i při pomalém běhu.
     */
    draw(ctx, cx, cy, size) {
        const run = this.stalled ? 0 : 1;
        const gait = this.animPhase * 13;
        const wag = Math.sin(gait * 0.5) * (0.10 + 0.10 * run);
        const sniff = this.stalled ? Math.sin(this.animPhase * 16) * 0.02 : 0;

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
                const swing = Math.sin(gait + phase + (side > 0 ? Math.PI : 0)) * 0.07 * run;
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
