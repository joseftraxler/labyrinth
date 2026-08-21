import {Theme} from "../theme.js";
import {TAU, noise} from "../draw.js";

/**
 * Sklep. Cihlové zdi, udusaná hlína, pavučiny v koutech a prach, který se ve
 * světle line vzduchem. Nejtmavší ze světů – tady se hra hraje po čichu.
 */
export class Cellar extends Theme {
    name() {
        return 'Sklep';
    }

    background() {
        return '#0a0806';
    }

    paintFloor(ctx, size, variant) {
        ctx.fillStyle = '#241a12';
        ctx.fillRect(0, 0, size, size);

        // udusaná hlína – nepravidelné světlejší šmouhy
        ctx.fillStyle = 'rgba(120, 92, 60, 0.16)';
        for (let i = 0; i < 5; i++) {
            const n = noise(variant * 8.3 + i * 2.7);
            const m = noise(variant * 5.1 + i * 6.3);
            ctx.beginPath();
            ctx.ellipse(n * size, m * size, size * 0.16, size * 0.07, n * TAU, 0, TAU);
            ctx.fill();
        }
    }

    paintWall(ctx, size, variant) {
        ctx.fillStyle = '#4a2a1d';
        ctx.fillRect(0, 0, size, size);

        // cihly – dvě řady s přesazenou spárou
        ctx.fillStyle = '#5d3625';
        const h = size * 0.42;
        for (let row = 0; row < 2; row++) {
            const shift = row === 0 ? 0 : size * 0.5;
            for (let i = -1; i < 2; i++) {
                ctx.fillRect(i * size * 0.55 + shift + size * 0.03, row * (h + size * 0.08) + size * 0.05,
                    size * 0.49, h - size * 0.06);
            }
        }

        // plíseň v rozích
        ctx.fillStyle = 'rgba(90, 120, 70, 0.18)';
        for (let i = 0; i < 3; i++) {
            const n = noise(variant * 3.9 + i * 11.1);
            ctx.beginPath();
            ctx.arc(n * size, noise(n * 5) * size, size * 0.14, 0, TAU);
            ctx.fill();
        }
    }

    /** Pavučina se za kotoučem pily trhá – proto ji nekreslíme do dlaždice. */
    decorateSaw(ctx, cx, cy, size) {
        ctx.strokeStyle = 'rgba(220, 220, 235, 0.18)';
        ctx.lineWidth = size * 0.015;
        for (let i = 0; i < 4; i++) {
            const a = i / 4 * TAU;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.cos(a) * size * 0.62, cy + Math.sin(a) * size * 0.62);
            ctx.stroke();
        }
    }

    /** Prach ve vzduchu. Zrnka se počítají z místa a času, takže neposkakují. */
    drawAir(ctx) {
        const w = this.game.w;
        const h = this.game.h;

        for (let i = 0; i < 34; i++) {
            const drift = (this.clock * (8 + noise(i) * 14) + noise(i * 3.3) * h) % (h + 40);
            const x = noise(i * 7.7) * w + Math.sin(this.clock * 0.7 + i) * 6;
            const y = h - drift;

            const lit = this.lit(x, y);
            if (lit <= 0) continue;

            ctx.fillStyle = `rgba(214, 190, 150, ${(0.05 + 0.2 * lit).toFixed(3)})`;
            ctx.beginPath();
            ctx.arc(x, y, 1.6, 0, TAU);
            ctx.fill();
        }
    }

    audio() {
        return {
            style: 'cellar',
            bpm: 84,
            root: 49,                        // G1
            scale: [0, 1, 3, 5, 6, 8, 10],   // lokrická barva – sklep má znít nejistě
            voices: 3,
        };
    }
}
