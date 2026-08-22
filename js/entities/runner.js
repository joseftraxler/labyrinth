import {Entity} from "./entity.js";
import {DIRS, angleDiff, dirAngle} from "../draw.js";
import {TURN_RATE} from "../physics.js";

/**
 * Zvíře, které běží labyrintem po ose chodby a v křižovatce se rozhodne, kudy
 * dál (`chooseDir`). Takhle se pohybují **nástrahy, ne myš**: kočka po mřížce
 * hlídkuje, kdežto myš běží volně, kam ji hráč natočí (`js/entities/mouse.js`).
 * Pro kočku je mřížka správně – hlídkovat po chodbách je přesně to, co dělá,
 * a hráč jí do řízení nemluví.
 *
 * Dráha je uzamčená do mřížky, ale **zatáčky se projíždějí obloukem**: buňka se
 * přebíhá od hranice k hranici a při zahnutí vede cesta po čtvrtkruhu kolem
 * vnitřního rohu. Natočení je tím pádem vždycky směr, kterým se zvíře opravdu
 * žene, takže se v zatáčce plynule stáčí místo aby cuklo o 90°.
 *
 * Stav: buňka, kterou zvíře právě projíždí (`cx`, `cy`), směr, kterým do ní
 * vběhlo (`from`), směr, kterým z ní vyběhne (`dir`), a ujetá část buňky
 * (`off` v rozsahu 0–1, 0 na vstupní hranici, 1 na výstupní). Poloha `x`, `y`
 * se z toho počítá, ne naopak.
 *
 * **Rozhodnutí padá při vstupu do buňky**, ne uprostřed – jinak by nebylo kdy
 * oblouk začít. Přeběh buňky trvá vždycky stejně dlouho (`1 / rychlost`) bez
 * ohledu na to, jestli vede rovně nebo do zatáčky; oblouk je o pětinu kratší
 * než rovná cesta, takže zvíře v zatáčce o kousek zpomalí – a hlavně si díky
 * tomu odpovídá čas ve hře s tím, co počítá generátor (`tools/gen_mazes.py`).
 */
export class Runner extends Entity {
    reset() {
        this.cx = this.spawnX;
        this.cy = this.spawnY;
        this.dir = this.firstWayOut();
        this.from = this.dir;
        this.off = 0.5;            // startuje se uprostřed doupěte
        this.speed = 0;
        this.stalled = false;      // stojí čelem u zdi a čeká na pokyn
        this.turns = 0;            // kolik zatáček má za sebou (kvůli zvuku)
        super.reset();

        this.tangent = dirAngle(this.dir);
        this.heading = this.tangent;
        this.place();
    }

    /**
     * Směr, kterým se z výchozí buňky dá vyběhnout. Bez toho by zvíře v chodbě
     * vedoucí sever–jih startovalo čelem do zdi a stálo, dokud by mu někdo
     * neřekl, ať se otočí – a hráč by hru začínal nárazem.
     *
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
     * Přepočítá polohu a natočení z buňky, obou směrů a ujeté části. Rovně
     * skrz buňku je to úsečka přes střed, do zatáčky čtvrtkruh o poloměru půl
     * buňky kolem vnitřního rohu – oblouk začíná i končí přesně uprostřed
     * hranice, takže se do jednopolíčkové chodby vejde s rezervou.
     */
    place() {
        const from = DIRS[this.from];
        const dir = DIRS[this.dir];
        const cx = this.cx + 0.5;
        const cy = this.cy + 0.5;

        if (this.from === this.dir || (this.from + 2) % 4 === this.dir) {
            this.x = cx + dir.x * (this.off - 0.5);
            this.y = cy + dir.y * (this.off - 0.5);
            this.tangent = dirAngle(this.dir);
            return;
        }

        // střed oblouku je vnitřní roh zatáčky
        const ox = cx - 0.5 * from.x + 0.5 * dir.x;
        const oy = cy - 0.5 * from.y + 0.5 * dir.y;

        const start = Math.atan2(-dir.y, -dir.x);
        const sweep = angleDiff(start, Math.atan2(from.y, from.x));
        const angle = start + sweep * this.off;

        this.x = ox + Math.cos(angle) * 0.5;
        this.y = oy + Math.sin(angle) * 0.5;

        // Natočení jede po oblouku, ale s měkkým rozjezdem a dojezdem – konec
        // otáčení tak nesekne, i když oblouk končí ostře na hranici buňky.
        const turn = angleDiff(dirAngle(this.from), dirAngle(this.dir));
        this.tangent = dirAngle(this.from) + turn * smooth(this.off);
    }

    step(dt) {
        super.step(dt);

        if (this.stalled) {
            // Rozhodnutí se zkouší dál – jakmile přijde pokyn, zvíře se rozjede
            this.decide();
            if (this.stalled) {
                // Zapře se čelem do zdi doprostřed buňky a čeká
                this.off = Math.min(0.5, this.off + this.speed * dt);
                this.place();
                this.#turnHead(dt);
                return;
            }
        }

        let left = this.speed * dt;
        while (left > 0) {
            const toEdge = 1 - this.off;
            if (left < toEdge) {
                this.off += left;
                break;
            }

            left -= toEdge;
            this.cx += DIRS[this.dir].x;
            this.cy += DIRS[this.dir].y;
            this.from = this.dir;
            this.off = 0;
            this.decide();
            if (this.stalled) break;
        }

        this.place();
        this.#turnHead(dt);
    }

    /** Natočení dojíždí za směrem pohybu – kvůli otočkám, které jsou skokové. */
    #turnHead(dt) {
        const turn = angleDiff(this.heading, this.tangent);
        const most = TURN_RATE * dt;
        this.heading += Math.max(-most, Math.min(most, turn));
    }

    /**
     * Otočka o 180°. Zvíře se vrací po vlastní stopě, takže se jen prohodí
     * vstupní a výstupní hranice buňky – i uprostřed zatáčky se tím vrátí
     * po tomtéž oblouku.
     */
    reverse() {
        const from = this.from;
        this.from = (this.dir + 2) % 4;
        this.dir = (from + 2) % 4;
        this.off = 1 - this.off;
        this.stalled = false;
        this.turns++;
        this.place();
    }

    /** Je v tomhle směru z buňky, do které zvíře vbíhá, volno? */
    free(dir) {
        const d = DIRS[dir];
        return this.game.level.isFree(this.cx + d.x, this.cy + d.y);
    }

    /**
     * Vybere směr při vstupu do buňky. Když nevede nikam (slepá ulička), zvíře
     * se zastaví a čeká – otočit se musí ten, kdo ho řídí.
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
     * Pořadí, ve kterém se zkouší směry: rovně, doprava, doleva. Zpátky se
     * zvíře samo od sebe neotáčí – to je vždycky rozhodnutí, ne setrvačnost.
     * Vrací `null` pro slepou uličku.
     */
    followCorridor() {
        for (const turn of [0, 1, 3]) {
            const dir = (this.dir + turn) % 4;
            if (this.free(dir)) return dir;
        }
        return null;
    }
}

// Měkký rozjezd a dojezd (smoothstep) – z 0 do 1 bez zlomu na koncích
function smooth(t) {
    return t * t * (3 - 2 * t);
}
