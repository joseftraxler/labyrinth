import {Entity} from "./entity.js";
import {DIRS, angleDiff, dirAngle} from "../draw.js";
import {TURN_RATE} from "../physics.js";

/**
 * Zvíře, které běží labyrintem po ose chodby. Myš i kočka se pohybují stejně –
 * liší se jen tím, **kdo rozhoduje** v křižovatce (`chooseDir`): u myši hráč,
 * u kočky její vlastní hlava.
 *
 * Pohyb je uzamčený do mřížky, protože se z toho odvíjí všechno ostatní:
 *   - hra je ovladatelná jedním prstem (řekni jen „vlevo“, myš zatočí přesně),
 *   - otáčení labyrintu je plynulé i při ostrém zahnutí (natáčení má vlastní
 *     rychlost `TURN_RATE`, pozice na ose chodby se mění skokem),
 *   - a hlavně je pohyb **přesně předvídatelný**, takže umí generátor
 *     (`tools/gen_mazes.py`) level odsimulovat a ověřit průchodnost.
 *
 * Stav je uložený jako buňka posledního rozhodnutí (`cx`, `cy`), směr (`dir`)
 * a ujetá vzdálenost od jejího středu (`off` v rozsahu 0–1). Ze všech tří se
 * pak počítá poloha `x`, `y`. Rozhodnutí padají **jen ve středech buněk**.
 */
export class Runner extends Entity {
    reset() {
        this.cx = this.spawnX;
        this.cy = this.spawnY;
        this.dir = this.firstWayOut();
        this.off = 0;
        this.speed = 0;
        this.stalled = false;      // stojí čelem u zdi a čeká na pokyn
        this.turns = 0;            // kolik zatáček má za sebou (kvůli zvuku)
        super.reset();
        this.heading = dirAngle(this.dir);
        this.place();
        this.decide();
    }

    /**
     * Směr, kterým se z výchozí buňky dá vyběhnout. Bez toho by zvíře v chodbě
     * vedoucí sever–jih startovalo čelem do zdi a stálo, dokud by mu někdo
     * neřekl, ať se otočí – a hráč by hru začínal nárazem.
     *
     * Stejně jako `place()` je metoda schválně veřejná: volá se z `reset()`,
     * tedy ještě z konstruktoru předka, kde soukromé metody podtřídy neexistují.
     */
    firstWayOut() {
        for (let dir = 0; dir < 4; dir++) {
            const d = DIRS[dir];
            if (this.game.level.isFree(this.spawnX + d.x, this.spawnY + d.y)) return dir;
        }
        return 0;
    }

    /** Přepočítá polohu z buňky, směru a ujeté vzdálenosti – ne naopak. */
    place() {
        const d = DIRS[this.dir];
        this.x = this.cx + 0.5 + d.x * this.off;
        this.y = this.cy + 0.5 + d.y * this.off;
    }

    step(dt) {
        super.step(dt);

        // Natočení se za směrem opožďuje – z toho vzniká plynulé otáčení
        // labyrintu, i když se myš na ose chodby zalomí v rohu naráz.
        const turn = angleDiff(this.heading, dirAngle(this.dir));
        const most = TURN_RATE * dt;
        this.heading += Math.max(-most, Math.min(most, turn));

        if (this.stalled) {
            // Rozhodnutí se zkouší dál – jakmile přijde pokyn, zvíře se rozjede
            this.decide();
            if (this.stalled) return;
        }

        let left = this.speed * dt;
        while (left > 0) {
            const toCenter = 1 - this.off;
            if (left < toCenter) {
                this.off += left;
                break;
            }

            left -= toCenter;
            this.cx += DIRS[this.dir].x;
            this.cy += DIRS[this.dir].y;
            this.off = 0;
            this.decide();
            if (this.stalled) break;
        }

        this.place();
    }

    /** Otočka o 180° – jediné rozhodnutí, které nečeká na střed buňky. */
    reverse() {
        this.cx += DIRS[this.dir].x;
        this.cy += DIRS[this.dir].y;
        this.off = 1 - this.off;
        this.dir = (this.dir + 2) % 4;
        this.stalled = false;
        this.turns++;
        this.place();
    }

    /** Je v tomhle směru z buňky rozhodnutí volno? */
    free(dir) {
        const d = DIRS[dir];
        return this.game.level.isFree(this.cx + d.x, this.cy + d.y);
    }

    /**
     * Vybere směr ve středu buňky. Když nevede nikam (slepá ulička), zvíře se
     * zastaví a čeká – otočit se musí ten, kdo ho řídí.
     */
    decide() {
        const dir = this.chooseDir();
        if (dir === null) {
            this.stalled = true;
            return;
        }
        if (dir !== this.dir) this.turns++;
        this.dir = dir;
        this.stalled = false;
    }

    /**
     * Abstraktní rozhodnutí: kterým směrem z téhle buňky dál (nebo `null`,
     * když to nejde nikam než zpátky).
     * @returns {number|null}
     */
    chooseDir() {
        throw new Error('chooseDir() musí být implementováno v podtřídě');
    }

    /**
     * Pořadí, ve kterém se zkouší směry, když nikdo nic neřekl: rovně, doprava,
     * doleva. Zpátky se nikdy samo od sebe neotáčí – to je vždycky rozhodnutí,
     * ne setrvačnost. Vrací `null` pro slepou uličku.
     */
    followCorridor() {
        for (const turn of [0, 1, 3]) {
            const dir = (this.dir + turn) % 4;
            if (this.free(dir)) return dir;
        }
        return null;
    }
}
