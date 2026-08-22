import {TAU, noise, roundRect} from "./draw.js";

/**
 * Prostředí levelu. Jedna třída = jeden svět: říká, jak labyrint vypadá,
 * kreslí všechno, co se tématem mění (podlaha, zdi, pasti, sýr, doupě, východ,
 * vzduch nad obrazem) a vybírá motiv hudby (`audio()`).
 *
 * Vazba je stejná jako u entit: **téma hru neřídí, jen do ní nahlíží.**
 * Nemění stav hry ani skóre – dostane od `Game` plátno a souřadnice a kreslí.
 * Hra se naopak nikdy neptá „jaké je téma“ a nevětví se podle jeho jména:
 * zavolá metodu a co se stane, si rozhoduje téma samo. Nová podmínka
 * `if (theme === ...)` v `game.js` znamená, že chybí metoda tady.
 *
 * Sama `Theme` je zároveň **prostředí levelů bez tématu** – kamenné katakomby
 * pod městem. Ostatní světy z ní přepisují jen to, čím se liší; povinné je
 * jenom `name()`.
 *
 * Dlaždice podlahy a zdi se **předkreslují** (`paintFloor`, `paintWall` dostanou
 * prázdné plátno velikosti buňky): podlahu je vidět v každém snímku a stokrát,
 * rasterizovat ji pokaždé znovu je to nejdražší, co se ve snímku dá udělat.
 * Proto se z nich kreslí do dlaždice jen to, co je **stálé** – cokoliv, co se
 * hýbe, patří do `drawAir` nebo k pastem.
 */
export class Theme {
    /**
     * @param {import("./game.js").Game} game
     */
    constructor(game) {
        this.game = game;
    }

    // ---- Zkratky do hry ----

    get level() {
        return this.game.level;
    }

    get tile() {
        return this.game.tile;
    }

    get clock() {
        return this.game.clock;
    }

    /** Odstín odvozený z čísla levelu – dva levely téhož světa nevypadají stejně. */
    get shade() {
        return (this.game.levelIndex * 47) % 360;
    }

    /**
     * Jak je bod obrazovky nasvícený (0 daleko ve tmě, 1 u myši). Atmosféra
     * v `drawAir` se tím musí násobit – prach ani kapky nemají svítit tam, kam
     * myš nevidí.
     */
    lit(x, y) {
        const dx = x - this.game.viewX;
        const dy = y - this.game.viewY;
        const reach = this.tile * 7;
        return Math.max(0, 1 - Math.hypot(dx, dy) / reach);
    }

    /** Jméno světa do překryvu (null = level bez tématu). */
    name() {
        return null;
    }

    /** Barva tmy za dosvitem. Musí být temná – tma je půlka téhle hry. */
    background() {
        return '#080a12';
    }

    // ---- Dlaždice ----

    paintFloor(ctx, size, variant) {
        ctx.fillStyle = '#12151f';
        ctx.fillRect(0, 0, size, size);

        // kamenná deska: světlejší střed, tmavá spára kolem. Rám musí být
        // souměrný – labyrint se otáčí a nesmí být poznat, kde je „nahoře“.
        ctx.fillStyle = '#1b2032';
        ctx.fillRect(size * 0.06, size * 0.06, size * 0.88, size * 0.88);

        ctx.fillStyle = 'rgba(160, 190, 230, 0.05)';
        for (let i = 0; i < 4; i++) {
            const n = noise(variant * 9.1 + i * 3.3);
            const m = noise(variant * 4.7 + i * 7.1);
            ctx.fillRect(n * size * 0.8, m * size * 0.8, size * 0.08, size * 0.08);
        }
    }

    paintWall(ctx, size, variant) {
        ctx.fillStyle = '#2a3049';
        ctx.fillRect(0, 0, size, size);

        // kvádr s odsazenou hranou – ze všech stran stejný, ať zeď vypadá
        // stejně bez ohledu na natočení labyrintu
        ctx.fillStyle = '#4d5678';
        ctx.fillRect(size * 0.08, size * 0.08, size * 0.84, size * 0.84);
        ctx.fillStyle = '#5b6689';
        ctx.fillRect(size * 0.08, size * 0.08, size * 0.84, size * 0.3);

        ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
        for (let i = 0; i < 3; i++) {
            const n = noise(variant * 12.3 + i * 5.9);
            ctx.fillRect(n * size * 0.6 + size * 0.1, (0.3 + i * 0.2) * size, size * 0.26, size * 0.05);
        }
    }

    // ---- Věci v mapě ----

    /**
     * Sýr. Houpe se, aby ho bylo v tmavé chodbě vidět, a kreslí se jako
     * **klín s dírami** – kolečko s trojúhelníkem by v šeru vypadalo jako
     * tlačítko, ne jako sýr.
     */
    drawCheese(ctx, cx, cy, size, phase) {
        const bob = Math.sin(phase * 2.4) * size * 0.04;
        const r = size * 0.34;

        ctx.save();
        ctx.translate(cx, cy + bob);

        ctx.fillStyle = 'rgba(255, 226, 140, 0.22)';
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.15, 0, TAU);
        ctx.fill();

        // Klín je natočený – souměrný trojúhelník v kroužku vypadal jako
        // tlačítko „přehrát“, ne jako kus sýra.
        ctx.rotate(-0.35);

        // klín: špička vlevo, kulatá kůrka vpravo
        ctx.fillStyle = '#ffd45e';
        ctx.beginPath();
        ctx.moveTo(-r * 0.85, -r * 0.1);
        ctx.lineTo(r * 0.55, -r * 0.7);
        ctx.quadraticCurveTo(r * 0.95, 0, r * 0.55, r * 0.7);
        ctx.closePath();
        ctx.fill();

        // kůrka na horní hraně, ať je poznat, že klín má tloušťku
        ctx.strokeStyle = '#e8ae33';
        ctx.lineWidth = size * 0.045;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(-r * 0.85, -r * 0.1);
        ctx.lineTo(r * 0.55, -r * 0.7);
        ctx.stroke();

        // díry
        ctx.fillStyle = '#d99a24';
        for (const [hx, hy, hr] of [[0.1, 0.05, 0.17], [0.45, -0.25, 0.11], [0.3, 0.35, 0.09]]) {
            ctx.beginPath();
            ctx.arc(hx * size, hy * size, hr * size * 0.55, 0, TAU);
            ctx.fill();
        }

        ctx.restore();
    }

    /**
     * Sklapovací past. `arm` je 0 (natažená) až 1 (sklapnutá) – dostává ji
     * hotovou z `js/traps.js`, o čase nic neví.
     *
     * Kreslí se velká a se světlým kovem: v tmavé chodbě, která se navíc pod
     * hráčem otáčí, musí být na první pohled jasné, co je past a jestli je
     * natažená.
     */
    drawSnap(ctx, cx, cy, size, arm) {
        const w = size * 0.78;
        const h = size * 0.56;
        const shut = Math.min(arm, 1);

        ctx.save();
        ctx.translate(cx, cy);

        // prkénko
        ctx.fillStyle = '#a57040';
        roundRect(ctx, -w / 2, -h / 2, w, h, size * 0.06);
        ctx.fill();
        ctx.strokeStyle = 'rgba(20, 12, 6, 0.6)';
        ctx.lineWidth = size * 0.03;
        ctx.stroke();

        // návnada
        ctx.fillStyle = '#ffd45e';
        ctx.beginPath();
        ctx.arc(w * 0.18, 0, size * 0.08, 0, TAU);
        ctx.fill();

        // třmen: natažený stojí kolmo nad prkénkem, sklapnutý leží přes něj
        ctx.save();
        ctx.translate(-w * 0.36, 0);
        ctx.rotate(-Math.PI * 0.62 * (1 - shut));

        ctx.strokeStyle = shut >= 1 ? '#ffffff' : '#cfd7ea';
        ctx.lineWidth = size * 0.075;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(0, -h * 0.4);
        ctx.lineTo(w * 0.72, -h * 0.4);
        ctx.lineTo(w * 0.72, h * 0.4);
        ctx.lineTo(0, h * 0.4);
        ctx.stroke();
        ctx.restore();

        // pružina u pantu – podle ní je vidět, kde má past sílu
        ctx.fillStyle = '#8e97b0';
        ctx.beginPath();
        ctx.arc(-w * 0.36, 0, size * 0.07, 0, TAU);
        ctx.fill();

        ctx.restore();
    }

    /** Propadlo. `lid` je 0 (zavřené víko) až 1 (otevřená díra). */
    drawPit(ctx, cx, cy, size, lid) {
        const r = size * 0.42;

        ctx.save();
        ctx.translate(cx, cy);

        ctx.fillStyle = '#05060b';
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, TAU);
        ctx.fill();

        ctx.strokeStyle = 'rgba(210, 220, 245, 0.35)';
        ctx.lineWidth = size * 0.05;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, TAU);
        ctx.stroke();

        // dvě křídla víka, která se rozevírají do stran
        ctx.fillStyle = '#2b3145';
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.lineWidth = size * 0.02;
        for (const side of [-1, 1]) {
            const open = lid * r * 0.95;
            ctx.beginPath();
            ctx.moveTo(side * open, -r);
            ctx.lineTo(side * r, -r);
            ctx.lineTo(side * r, r);
            ctx.lineTo(side * open, r);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        }

        ctx.restore();
    }

    /**
     * Východ z labyrintu – **vrátka do myšího ráje**. Za nimi je louka se
     * sýrovými koly, ne slepá zeď: z chodby má být poznat, že tudy cesta
     * nekončí, ale začíná.
     *
     * `out` je úhel ven z labyrintu (`Level.exitAngle`) a je to jediná kresba
     * ve hře, která nějaké natočení má. Pravidlo „kresba nesmí mít nahoře“ tím
     * porušené není: vrátka nemají nahoře, mají **ven** – a to se otáčí spolu
     * se zdí, ve které stojí.
     *
     * `open` je 0 (zavřeno, v labyrintu ještě zbývá sýr) až 1 (dokořán).
     * Otevírá je `Game`, když myš sebere poslední sýr.
     */
    drawExit(ctx, cx, cy, size, out, open) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(out);

        this.drawParadise(ctx, size, open);
        this.drawGate(ctx, size, open);

        ctx.restore();
    }

    /**
     * Myší ráj za vrátky: světlo, louka a sýrová kola. Kreslí se ven od
     * východu (+x) a **měkce se rozplývá** – za východem už žádná mapa není,
     * takže ostrá hrana by vypadala jako vystřižený papír.
     *
     * Zavřenými vrátky je vidět jen kousek světla; louka se rozsvítí s `open`.
     */
    drawParadise(ctx, size, open) {
        const base = ctx.globalAlpha;       // dosvit – ráj svítí jen tak, jak je na něj vidět
        const day = 0.28 + 0.72 * open;

        const sky = ctx.createRadialGradient(size * 1.7, 0, size * 0.15, size * 1.7, 0, size * 3.1);
        sky.addColorStop(0, `rgba(255, 251, 226, ${0.95 * day})`);
        sky.addColorStop(0.35, `rgba(216, 240, 178, ${0.82 * day})`);
        sky.addColorStop(0.72, `rgba(118, 194, 128, ${0.42 * day})`);
        sky.addColorStop(1, 'rgba(118, 194, 128, 0)');
        ctx.fillStyle = sky;
        ctx.beginPath();
        ctx.arc(size * 1.7, 0, size * 3.1, 0, TAU);
        ctx.fill();

        if (open <= 0.02) return;

        // Louka i sýry se rozkládají **do vějíře před vrátky**: z chodby je vidět
        // jen výseč, tak ať v ní něco je. Místa se berou z `noise`, ne z náhody –
        // jinak by se louka v každém snímku přeskládala.
        const fan = (i, count, spread, near, far) => {
            const angle = (i / (count - 1) - 0.5) * spread;
            const reach = size * (near + noise(i * 7.3 + count) * (far - near));
            return {x: Math.cos(angle) * reach, y: Math.sin(angle) * reach};
        };

        ctx.strokeStyle = `rgba(70, 146, 80, ${0.6 * open})`;
        ctx.lineWidth = size * 0.032;
        ctx.lineCap = 'round';
        for (let i = 0; i < 30; i++) {
            const at = fan(i, 30, 2.1, 0.9, 3);
            const sway = Math.sin(this.clock * 1.6 + i) * size * 0.05;
            ctx.beginPath();
            ctx.moveTo(at.x, at.y);
            ctx.quadraticCurveTo(at.x + sway * 0.5, at.y - size * 0.09, at.x + sway, at.y - size * 0.18);
            ctx.stroke();
        }

        // Sýrová kola – kvůli nim se do ráje běží
        ctx.globalAlpha = base * open;
        for (let i = 0; i < 6; i++) {
            const at = fan(i, 6, 1.7, 1.1, 2.6);
            const bob = Math.sin(this.clock * 2 + i * 1.7) * size * 0.03;
            this.drawCheese(ctx, at.x, at.y + bob, size * 0.8, this.clock + i * 2.1);
        }
        ctx.globalAlpha = base;

        // Jiskry, které z otevřených vrátek odlétají ven – aby bylo poznat,
        // kterým směrem se běží
        ctx.fillStyle = `rgba(255, 250, 214, ${0.75 * open})`;
        for (let i = 0; i < 10; i++) {
            const t = (this.clock * 0.4 + noise(i * 2.1)) % 1;
            const px = size * (0.4 + t * 2.4);
            const py = size * (noise(i * 6.7) - 0.5) * 1.6 * (0.35 + t);
            ctx.beginPath();
            ctx.arc(px, py, size * 0.035 * (1 - t), 0, TAU);
            ctx.fill();
        }
    }

    /**
     * Vrátka v obvodové zdi: dvě křídla na veřejích, která se s posledním
     * sýrem rozevřou ven. Zavřená mají uprostřed sýrový zámek – ať je na první
     * pohled jasné, čím se otevírají.
     */
    drawGate(ctx, size, open) {
        const jamb = size * 0.46;               // veřeje na krajích chodby
        const swing = open * Math.PI * 0.56;    // dokořán leží křídla podél zdi

        // Práh: světlé kameny na hranici labyrintu a louky
        ctx.fillStyle = 'rgba(226, 218, 196, 0.55)';
        ctx.fillRect(-size * 0.1, -jamb, size * 0.2, jamb * 2);
        ctx.strokeStyle = 'rgba(60, 52, 40, 0.35)';
        ctx.lineWidth = size * 0.015;
        for (const at of [-0.45, 0, 0.45]) {
            ctx.beginPath();
            ctx.moveTo(-size * 0.1, at * jamb);
            ctx.lineTo(size * 0.1, at * jamb);
            ctx.stroke();
        }

        // Světlo, které otevřenými vrátky padá zpátky do chodby
        if (open > 0.02) {
            const spill = ctx.createLinearGradient(0, 0, -size * 1.4, 0);
            spill.addColorStop(0, `rgba(255, 246, 206, ${0.4 * open})`);
            spill.addColorStop(1, 'rgba(255, 246, 206, 0)');
            ctx.fillStyle = spill;
            ctx.fillRect(-size * 1.4, -jamb, size * 1.4, jamb * 2);
        }

        // Křídla vrátek. Otáčejí se kolem veřeje: zavřená se potkávají
        // uprostřed průchodu, otevřená leží podél zdi.
        for (const side of [-1, 1]) {
            ctx.save();
            ctx.translate(0, side * jamb);
            ctx.rotate(side * (swing - Math.PI / 2));

            const thick = size * 0.055;
            ctx.fillStyle = '#c98f4e';
            roundRect(ctx, 0, -thick, jamb, thick * 2, thick * 0.7);
            ctx.fill();
            ctx.strokeStyle = 'rgba(58, 34, 12, 0.6)';
            ctx.lineWidth = size * 0.018;
            ctx.stroke();

            ctx.strokeStyle = 'rgba(58, 34, 12, 0.35)';
            for (let i = 1; i < 3; i++) {
                const at = jamb * i / 3;
                ctx.beginPath();
                ctx.moveTo(at, -thick);
                ctx.lineTo(at, thick);
                ctx.stroke();
            }

            ctx.restore();
        }

        // Veřeje – kamenné patky, ve kterých jsou křídla zavěšená
        ctx.fillStyle = '#b9b3a0';
        ctx.strokeStyle = 'rgba(40, 34, 24, 0.5)';
        ctx.lineWidth = size * 0.02;
        for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.arc(0, side * jamb, size * 0.1, 0, TAU);
            ctx.fill();
            ctx.stroke();
        }

        // Sýrový zámek na spáře mezi křídly – mizí, jak se vrátka otevírají
        if (open < 0.98) {
            const was = ctx.globalAlpha;
            ctx.globalAlpha = was * (1 - open);
            this.drawCheese(ctx, 0, 0, size * 0.5, this.clock);
            ctx.globalAlpha = was;
        }
    }

    /** Doupě, ze kterého se vybíhá. Kreslí se pod myš, takže drž kresbu nízkou. */
    drawDen(ctx, cx, cy, size) {
        ctx.save();
        ctx.translate(cx, cy);

        ctx.strokeStyle = 'rgba(190, 160, 110, 0.55)';
        ctx.lineWidth = size * 0.035;
        for (let i = 0; i < 7; i++) {
            const a = noise(i * 3.1) * TAU;
            const r = size * (0.16 + noise(i * 7.7) * 0.2);
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r * 0.6);
            ctx.lineTo(Math.cos(a + 2.2) * r, Math.sin(a + 2.2) * r * 0.6);
            ctx.stroke();
        }

        ctx.restore();
    }

    /** Převlek pily podle světa (výchozí kotouč si kreslí pila sama). */
    decorateSaw(ctx, cx, cy, size) {
    }

    /**
     * Vzduch nad hotovým obrazem: prach, kapky, pára. Kreslí se **po** tmě
     * a bez otáčení kamerou, takže to nesmí být nic, co patří do mapy.
     */
    drawAir(ctx) {
    }

    /**
     * Motiv hudby světa. Co se hraje, ví prostředí; jak se to hraje, ví
     * `js/audio.js`.
     */
    audio() {
        return {
            style: 'catacombs',
            bpm: 96,
            root: 55,                       // A1
            scale: [0, 2, 3, 5, 7, 8, 10],  // přirozená moll
            voices: 3,
        };
    }
}
