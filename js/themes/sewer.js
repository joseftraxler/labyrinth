import {Theme} from "../theme.js";
import {TAU, noise} from "../draw.js";

/**
 * Kanál. Beton, voda u stěn, ozvěna a kapky ze stropu. Propadla v podlaze sem
 * patří nejvíc – pod nimi teče.
 */
export class Sewer extends Theme {
    name() {
        return 'Kanál';
    }

    background() {
        return '#05090c';
    }

    paintFloor(ctx, size, variant) {
        ctx.fillStyle = '#0b1319';
        ctx.fillRect(0, 0, size, size);

        ctx.fillStyle = '#111d25';
        ctx.fillRect(size * 0.05, size * 0.05, size * 0.9, size * 0.9);

        // mokré skvrny s odleskem
        ctx.fillStyle = 'rgba(90, 190, 200, 0.10)';
        for (let i = 0; i < 3; i++) {
            const n = noise(variant * 7.3 + i * 5.5);
            const m = noise(variant * 2.9 + i * 8.1);
            ctx.beginPath();
            ctx.ellipse(n * size, m * size, size * 0.2, size * 0.11, 0, 0, TAU);
            ctx.fill();
        }

        ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.lineWidth = Math.max(1, size * 0.025);
        ctx.strokeRect(0, 0, size, size);
    }

    paintWall(ctx, size, variant) {
        ctx.fillStyle = '#33444f';
        ctx.fillRect(0, 0, size, size);

        // betonový panel s odřenou hranou
        ctx.fillStyle = '#516777';
        ctx.fillRect(size * 0.07, size * 0.07, size * 0.86, size * 0.86);
        ctx.fillStyle = '#5f7889';
        ctx.fillRect(size * 0.07, size * 0.07, size * 0.86, size * 0.28);

        // čára po vodě u paty zdi
        ctx.fillStyle = 'rgba(60, 150, 140, 0.25)';
        ctx.fillRect(size * 0.07, size * 0.76, size * 0.86, size * 0.17);

        ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
        for (let i = 0; i < 2; i++) {
            const n = noise(variant * 11.9 + i * 3.7);
            ctx.fillRect(n * size * 0.8, size * 0.2, size * 0.06, size * 0.5);
        }
    }

    /** Kapky ze stropu – padají v místech, která se s časem nemění. */
    drawAir(ctx) {
        const w = this.game.w;
        const h = this.game.h;

        ctx.lineWidth = 1.6;
        for (let i = 0; i < 9; i++) {
            const period = 1.6 + noise(i) * 2.4;
            const t = (this.clock + noise(i * 4.1) * period) % period / period;
            if (t > 0.55) continue;
            const x = noise(i * 9.3) * w;
            const y = t / 0.55 * h;

            const lit = this.lit(x, y);
            if (lit <= 0) continue;

            ctx.strokeStyle = `rgba(150, 220, 235, ${(0.1 + 0.4 * lit).toFixed(3)})`;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x, y + 9);
            ctx.stroke();
        }
    }

    audio() {
        return {
            style: 'sewer',
            bpm: 72,
            root: 43.65,                     // F1
            scale: [0, 2, 3, 5, 7, 9, 10],   // dórská – kanál duní, ale nezní beznadějně
            voices: 3,
        };
    }
}
