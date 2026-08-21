import {Theme} from "../theme.js";
import {TAU, noise} from "../draw.js";

/**
 * Kuchyň. Kachlíky, linoleum, drobky pod linkou – nejsvětlejší svět, zato
 * plný sklapovaček: kdo staví pasti, staví je tady.
 */
export class Kitchen extends Theme {
    name() {
        return 'Kuchyň';
    }

    background() {
        return '#0d1014';
    }

    paintFloor(ctx, size, variant) {
        // šachovnicové linoleum – vzor se bere z podoby dlaždice, ne z pořadí
        const dark = variant % 2 === 0;
        ctx.fillStyle = dark ? '#2b3038' : '#3a414c';
        ctx.fillRect(0, 0, size, size);

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.lineWidth = Math.max(1, size * 0.02);
        ctx.strokeRect(0, 0, size, size);

        // drobky
        ctx.fillStyle = 'rgba(226, 194, 128, 0.5)';
        for (let i = 0; i < 3; i++) {
            const n = noise(variant * 6.1 + i * 4.3);
            const m = noise(variant * 9.7 + i * 2.9);
            if (n < 0.45) continue;
            ctx.fillRect(n * size * 0.9, m * size * 0.9, size * 0.05, size * 0.04);
        }
    }

    paintWall(ctx, size, variant) {
        ctx.fillStyle = '#a9b6c6';
        ctx.fillRect(0, 0, size, size);

        // čtyři kachlíky se spárou
        ctx.fillStyle = '#c6d2e0';
        const half = size * 0.5;
        for (let i = 0; i < 2; i++) {
            for (let j = 0; j < 2; j++) {
                ctx.fillRect(i * half + size * 0.03, j * half + size * 0.03, half - size * 0.06, half - size * 0.06);
            }
        }

        // odlesk a občasná prasklina
        ctx.strokeStyle = 'rgba(140, 160, 185, 0.5)';
        ctx.lineWidth = size * 0.015;
        if (noise(variant * 13.7) > 0.6) {
            ctx.beginPath();
            ctx.moveTo(size * 0.2, size * 0.1);
            ctx.lineTo(size * 0.42, size * 0.55);
            ctx.lineTo(size * 0.3, size * 0.9);
            ctx.stroke();
        }
    }

    /** Pila je tady kotouč mixéru – kov v kuchyni musí lesknout. */
    decorateSaw(ctx, cx, cy, size) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = size * 0.03;
        ctx.beginPath();
        ctx.arc(cx, cy, size * 0.3, -1.2, 0.2);
        ctx.stroke();
    }

    audio() {
        return {
            style: 'kitchen',
            bpm: 126,
            root: 65.41,                     // C2
            scale: [0, 2, 4, 5, 7, 9, 11],   // dur – kuchyň je jasná a hravá
            voices: 3,
        };
    }
}
