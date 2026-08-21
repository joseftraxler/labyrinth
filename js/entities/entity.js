/**
 * Základní entita ve světě. Souřadnice `x`, `y` jsou **střed** entity
 * v jednotkách buněk (střed buňky [3,5] je tedy 3.5, 5.5).
 *
 * Entita se stará jen sama o sebe: hýbe se a umí se vykreslit. Do světa
 * (`this.game.level`) jen nahlíží kvůli vlastnímu pohybu – nemění skóre ani
 * stav hry. O tom, co se stane (smrt, sebrání sýra, útěk z labyrintu),
 * rozhoduje `Game`.
 */
export class Entity {
    constructor(game, x, y) {
        this.game = game;
        this.spawnX = x;
        this.spawnY = y;
        this.reset();
    }

    reset() {
        this.x = this.spawnX + 0.5;
        this.y = this.spawnY + 0.5;
        this.animPhase = 0; // naakumulovaný čas, slouží k animaci
    }

    step(dt) {
        this.animPhase += dt;
    }

    /** Buňka, ve které entita právě je. */
    get cellX() {
        return Math.floor(this.x);
    }

    get cellY() {
        return Math.floor(this.y);
    }

    /**
     * Abstraktní metoda: vykreslení entity na plátno.
     * Hra předá kontext (už otočený kamerou), pixelovou pozici středu
     * a velikost buňky, takže entita nemá žádnou vazbu na hru samotnou.
     *
     * @param {CanvasRenderingContext2D} ctx  kontext, do kterého se kreslí
     * @param {number} cx    x-ová souřadnice středu entity v pixelech
     * @param {number} cy    y-ová souřadnice středu entity v pixelech
     * @param {number} size  velikost buňky v pixelech
     */
    draw(ctx, cx, cy, size) {
        throw new Error('draw() musí být implementováno v podtřídě');
    }
}
