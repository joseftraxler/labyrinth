/**
 * Zvuk hry. Efekty i hudba se skládají za běhu přes Web Audio API –
 * **žádné zvukové soubory**, ať zůstane hra bez závislostí a repozitář bez
 * binárek.
 *
 * Vazba je stejná jako u entit: `Game` zvuku říká, co se stalo (`play('cheese')`)
 * a jestli má hrát hudba (`setMusicOn`), zvuk o hře nic neví.
 *
 * - AudioContext smí vzniknout **až po interakci uživatele** – proto se
 *   `unlock()` volá z `handleAction`. Do té doby je `ctx` null a `play()`
 *   nedělá nic.
 * - Hudba je krokový sekvencer plánovaný dopředu (`LOOKAHEAD`) na vlastním
 *   časovači, ne v herní smyčce – jinak by při propadu snímků vynechávala.
 *   Krok je šestnáctina, takt jich má vždycky 16.
 * - **Co se hraje, ví prostředí** (`Theme.audio()`), tady je jen *jak* se to
 *   hraje. Nápěvy jsou napsané (`PHRASES`), ne losované: náhodné tóny dají
 *   procházku po stupnici, ne motiv, který si člověk zapamatuje.
 */

const STORAGE_KEY = 'labyrinth-muted';
const STEPS_PER_BAR = 16;
const LOOKAHEAD = 0.12;      // o kolik dopředu se plánuje (s)
const TICK = 25;             // jak často se plánuje (ms)

/**
 * Napsané nápěvy po světech. Čísla jsou **stupně stupnice** (0 = základní tón,
 * 7 = oktáva výš), `null` je pomlka. Level si vybere obměnu podle svého čísla,
 * takže dva levely téhož světa nezní stejně.
 */
const PHRASES = {
    catacombs: [
        [0, null, 2, null, 4, null, 2, null, 3, null, 2, null, 0, null, null, null],
        [4, null, 3, 2, null, 0, null, 2, 4, null, 5, null, 4, null, 2, null],
        [0, 0, null, 4, null, 3, null, null, 2, null, 4, 5, null, 4, null, null],
    ],
    cellar: [
        [0, null, null, 1, null, 3, null, null, 2, null, 1, null, 0, null, null, null],
        [3, null, 2, null, 0, null, null, 1, null, null, 3, null, 4, null, 3, null],
        [0, null, 3, null, 4, null, 3, null, 1, null, 0, null, null, null, null, null],
    ],
    kitchen: [
        [0, 2, 4, null, 4, 2, 0, null, 1, 3, 5, null, 4, null, 2, null],
        [4, null, 4, 5, 4, 2, null, 0, 2, null, 4, 2, 1, null, null, null],
        [7, null, 5, 4, null, 2, 4, null, 5, null, 4, null, 2, 0, null, null],
    ],
    sewer: [
        [0, null, null, null, 3, null, null, 2, null, null, 4, null, null, null, 2, null],
        [2, null, null, 4, null, null, 3, null, null, 0, null, null, null, 2, null, null],
        [4, null, null, 3, null, 5, null, null, 4, null, null, 2, null, null, 0, null],
    ],
};

export class Sound {
    constructor() {
        this.ctx = null;
        this.muted = readMuted();
        this.musicOn = false;
        this.motif = null;
        this.variant = 0;
        this.step = 0;
        this.nextStepTime = 0;
        this.timer = null;
    }

    /** AudioContext se smí založit až po dotyku – volá se z `Game.handleAction`. */
    unlock() {
        if (this.ctx) {
            if (this.ctx.state === 'suspended') this.ctx.resume();
            return;
        }

        const Ctor = window.AudioContext || window.webkitAudioContext;
        if (!Ctor) return;

        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.85;
        this.master.connect(this.ctx.destination);

        this.music = this.ctx.createGain();
        this.music.gain.value = 0.55;
        this.music.connect(this.master);

        if (this.musicOn) this.#startSequencer();
    }

    toggle() {
        this.muted = !this.muted;
        if (this.master) this.master.gain.value = this.muted ? 0 : 0.85;
        try {
            localStorage.setItem(STORAGE_KEY, this.muted ? '1' : '0');
        } catch { /* v soukromém režimu nevadí, že se to nezapamatuje */ }
        return this.muted;
    }

    setTrack(motif, levelIndex) {
        this.motif = motif;
        this.variant = levelIndex % (PHRASES[motif.style] ?? PHRASES.catacombs).length;
        this.step = 0;
    }

    setMusicOn(on) {
        this.musicOn = on;
        if (!this.ctx) return;
        if (on) this.#startSequencer();
        else this.#stopSequencer();
    }

    // ---- Efekty ----

    play(name) {
        if (!this.ctx || this.muted) return;
        const t = this.ctx.currentTime;

        switch (name) {
            case 'cheese':
                this.#blip(t, 880, 0.09, 'triangle');
                this.#blip(t + 0.07, 1320, 0.10, 'triangle');
                break;
            case 'bump':
                this.#thud(t, 120, 0.12);
                break;
            case 'snap':
                this.#clack(t);
                break;
            case 'meow':
                this.#meow(t);
                break;
            case 'death':
                this.#thud(t, 90, 0.3);
                this.#slide(t, 440, 70, 0.5, 'sawtooth');
                break;
            case 'gate':
                // Otevřená vrátka: rozsvícený kvintakord zdola nahoru. Zní jinak
                // než sýr i než doběh – hráč ho slyší z druhého konce labyrintu
                // a musí poznat, že se právě otevřela cesta ven.
                [0, 7, 12, 19].forEach((semi, i) => this.#blip(t + i * 0.06, 523 * 2 ** (semi / 12), 0.5, 'sine', 0.13));
                break;
            case 'complete':
                [0, 4, 7, 12].forEach((semi, i) => this.#blip(t + i * 0.09, 440 * 2 ** (semi / 12), 0.16, 'triangle'));
                break;
            case 'win':
                [0, 7, 12, 16, 19, 24].forEach((semi, i) => this.#blip(t + i * 0.12, 330 * 2 ** (semi / 12), 0.28, 'square', 0.14));
                break;
        }
    }

    #blip(t, freq, len, type = 'sine', gain = 0.2) {
        const osc = this.ctx.createOscillator();
        const amp = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t);
        amp.gain.setValueAtTime(0, t);
        amp.gain.linearRampToValueAtTime(gain, t + 0.01);
        amp.gain.exponentialRampToValueAtTime(0.001, t + len);
        osc.connect(amp).connect(this.master);
        osc.start(t);
        osc.stop(t + len + 0.02);
    }

    #slide(t, from, to, len, type = 'sine', gain = 0.18) {
        const osc = this.ctx.createOscillator();
        const amp = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(from, t);
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + len);
        amp.gain.setValueAtTime(gain, t);
        amp.gain.exponentialRampToValueAtTime(0.001, t + len);
        osc.connect(amp).connect(this.master);
        osc.start(t);
        osc.stop(t + len + 0.02);
    }

    #thud(t, freq, len) {
        const osc = this.ctx.createOscillator();
        const amp = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.4, t + len);
        amp.gain.setValueAtTime(0.35, t);
        amp.gain.exponentialRampToValueAtTime(0.001, t + len);
        osc.connect(amp).connect(this.master);
        osc.start(t);
        osc.stop(t + len + 0.02);
    }

    /** Sklapnutí pasti: krátký šum přes pásmovou propust – dřevo, ne pípnutí. */
    #clack(t, gain = 0.22) {
        const noise = this.#noiseBurst(t, 0.06);
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 1800;
        filter.Q.value = 1.4;

        const amp = this.ctx.createGain();
        amp.gain.setValueAtTime(gain, t);
        amp.gain.exponentialRampToValueAtTime(0.001, t + 0.06);

        noise.connect(filter).connect(amp).connect(this.master);
    }

    #meow(t) {
        const osc = this.ctx.createOscillator();
        const amp = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(420, t);
        osc.frequency.linearRampToValueAtTime(700, t + 0.12);
        osc.frequency.linearRampToValueAtTime(340, t + 0.42);

        filter.type = 'lowpass';
        filter.frequency.value = 1400;

        amp.gain.setValueAtTime(0, t);
        amp.gain.linearRampToValueAtTime(0.16, t + 0.06);
        amp.gain.exponentialRampToValueAtTime(0.001, t + 0.45);

        osc.connect(filter).connect(amp).connect(this.master);
        osc.start(t);
        osc.stop(t + 0.5);
    }

    #noiseBurst(t, len) {
        const frames = Math.ceil(this.ctx.sampleRate * len);
        const buffer = this.ctx.createBuffer(1, frames, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;

        const src = this.ctx.createBufferSource();
        src.buffer = buffer;
        src.start(t);
        return src;
    }

    // ---- Hudba ----

    #startSequencer() {
        if (this.timer || !this.ctx) return;
        this.nextStepTime = this.ctx.currentTime + 0.05;
        this.timer = setInterval(() => this.#schedule(), TICK);
    }

    #stopSequencer() {
        if (!this.timer) return;
        clearInterval(this.timer);
        this.timer = null;
    }

    #schedule() {
        if (!this.ctx || !this.motif) return;

        const spb = 60 / this.motif.bpm / 4;   // délka šestnáctiny
        while (this.nextStepTime < this.ctx.currentTime + LOOKAHEAD) {
            this.#playStep(this.step, this.nextStepTime);
            this.nextStepTime += spb;
            this.step = (this.step + 1) % (STEPS_PER_BAR * 4);
        }
    }

    /** Tón stupnice: `degree` je stupeň (může přetéct do vyšší oktávy). */
    #note(degree, octave = 0) {
        const scale = this.motif.scale;
        const index = ((degree % scale.length) + scale.length) % scale.length;
        const jump = Math.floor(degree / scale.length) + octave;
        return this.motif.root * 2 ** ((scale[index] + 12 * jump) / 12);
    }

    #playStep(step, t) {
        const bar = step % STEPS_PER_BAR;
        const phrase = (PHRASES[this.motif.style] ?? PHRASES.catacombs)[this.variant];
        const melody = phrase[bar];

        switch (this.motif.style) {
            case 'cellar':
                this.#arrangeCellar(bar, step, t, melody);
                break;
            case 'kitchen':
                this.#arrangeKitchen(bar, step, t, melody);
                break;
            case 'sewer':
                this.#arrangeSewer(bar, step, t, melody);
                break;
            default:
                this.#arrangeCatacombs(bar, step, t, melody);
        }
    }

    /** Katakomby: synthwave puls, basa na každou dobu, řídká melodie. */
    #arrangeCatacombs(bar, step, t, melody) {
        if (bar % 4 === 0) this.#kick(t);
        if (bar % 4 === 2) this.#hat(t, 0.06);
        if (bar % 2 === 0) this.#bass(t, this.#note(step % 32 < 16 ? 0 : 3, -1), 0.22);
        if (melody !== null) this.#pluck(t, this.#note(melody, 1), 0.3, 'sawtooth', 0.07);
    }

    /** Sklep: kapající puls, hluboká basa, ozvěna. */
    #arrangeCellar(bar, step, t, melody) {
        if (bar === 0 || bar === 9) this.#kick(t, 0.5);
        if (bar % 8 === 4) this.#clack(t, 0.05);
        if (bar % 8 === 0) this.#bass(t, this.#note(step % 64 < 32 ? 0 : 4, -1), 0.7);
        if (melody !== null) this.#pluck(t, this.#note(melody, 0), 0.6, 'triangle', 0.06);
    }

    /** Kuchyň: hopsavé osminky, dřívka a skleněné tóny. */
    #arrangeKitchen(bar, step, t, melody) {
        if (bar % 4 === 0) this.#kick(t);
        if (bar % 4 === 2) this.#clack(t, 0.06);
        if (bar % 2 === 1) this.#hat(t, 0.04);
        if (bar % 4 === 0) this.#bass(t, this.#note([0, 3, 4, 2][Math.floor(step / 16) % 4], -1), 0.18);
        if (melody !== null) this.#glass(t, this.#note(melody, 1), 0.35);
    }

    /** Kanál: dub – řídká basa, kapky a dlouhý dozvuk. */
    #arrangeSewer(bar, step, t, melody) {
        if (bar === 0) this.#kick(t, 0.6);
        if (bar === 6 || bar === 14) this.#hat(t, 0.05);
        if (bar % 16 === 0) this.#bass(t, this.#note(Math.floor(step / 32) % 2 ? 4 : 0, -1), 1.1);
        if (melody !== null) this.#glass(t, this.#note(melody, 0), 0.9, 0.05);
    }

    #kick(t, len = 0.35) {
        this.#thud(t, 110, len);
    }

    #hat(t, gain) {
        const noise = this.#noiseBurst(t, 0.04);
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 6500;

        const amp = this.ctx.createGain();
        amp.gain.setValueAtTime(gain, t);
        amp.gain.exponentialRampToValueAtTime(0.001, t + 0.04);

        noise.connect(filter).connect(amp).connect(this.music);
    }

    #bass(t, freq, len) {
        const osc = this.ctx.createOscillator();
        const amp = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        osc.type = 'sawtooth';
        osc.frequency.value = freq;
        filter.type = 'lowpass';
        filter.frequency.value = 320;

        amp.gain.setValueAtTime(0, t);
        amp.gain.linearRampToValueAtTime(0.16, t + 0.02);
        amp.gain.exponentialRampToValueAtTime(0.001, t + len);

        osc.connect(filter).connect(amp).connect(this.music);
        osc.start(t);
        osc.stop(t + len + 0.05);
    }

    #pluck(t, freq, len, type, gain) {
        const osc = this.ctx.createOscillator();
        const amp = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        osc.type = type;
        osc.frequency.value = freq;
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(2600, t);
        filter.frequency.exponentialRampToValueAtTime(700, t + len);

        amp.gain.setValueAtTime(0, t);
        amp.gain.linearRampToValueAtTime(gain, t + 0.015);
        amp.gain.exponentialRampToValueAtTime(0.001, t + len);

        osc.connect(filter).connect(amp).connect(this.music);
        osc.start(t);
        osc.stop(t + len + 0.05);
    }

    /** Skleněný tón – sinus s pátou harmonickou, rychlý náběh, dlouhý dozvuk. */
    #glass(t, freq, len, gain = 0.07) {
        for (const [mult, level] of [[1, 1], [2.76, 0.28]]) {
            const osc = this.ctx.createOscillator();
            const amp = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq * mult;
            amp.gain.setValueAtTime(0, t);
            amp.gain.linearRampToValueAtTime(gain * level, t + 0.008);
            amp.gain.exponentialRampToValueAtTime(0.001, t + len);
            osc.connect(amp).connect(this.music);
            osc.start(t);
            osc.stop(t + len + 0.05);
        }
    }
}

function readMuted() {
    try {
        return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
        return false;
    }
}
