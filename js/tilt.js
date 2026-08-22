/**
 * Ovládání nakloněním telefonu. Náklon doleva a doprava zatáčí – drží se jako
 * klávesa, takže myš zahne v první odbočce, která se naskytne, a při dalším
 * rozcestí zase.
 *
 * Vazba je stejná jako u zvuku a vibrací: `Game` se jen ptá, kam se naklání
 * (`read()`), náklon o hře nic neví.
 *
 * Tři věci, bez kterých by to na telefonu nefungovalo:
 *
 * - **Než přijde první událost, nevíme, jestli má zařízení čidlo.** Na desktopu
 *   `DeviceOrientationEvent` existuje, ale nikdy nic nepošle – proto se čeká na
 *   první náklon a teprve pak se přepínač v HUD ukáže. Na iOS se čidlo musí
 *   nejdřív povolit (`requestPermission`) a povolení jde vyžádat **jen z dotyku**,
 *   takže o něj žádá až přepnutí přepínače.
 * - **Klidová poloha se měří při zapnutí.** Nikdo nedrží telefon rovně; kdyby
 *   se náklon počítal od vodorovné roviny, hra by od začátku zatáčela sama.
 * - **Displej se otáčí, čidlo ne.** `beta` a `gamma` jsou vždycky v soustavě
 *   přístroje, takže se musí otočit podle `screen.orientation.angle`, jinak by
 *   se na ležato zatáčelo nakláněním od sebe a k sobě.
 */

const STORAGE_KEY = 'labyrinth-tilt';

// Práh ve stupních, kdy se začne zatáčet, a menší práh, kdy se zatáčení pustí.
// Rozdíl mezi nimi je schválně: jinak by se na hranici zatáčka zapínala
// a vypínala. Stačí mírné naklonění – čidlo v telefonu má rozlišení hluboko
// pod stupněm, takže se dá jet i s telefonem skoro na plocho.
const TURN_ON = 6;
const TURN_OFF = 3;

// Vyhlazení čtení z čidla (0–1, míň = klidnější, ale línější)
const SMOOTH = 0.3;

export class Tilt {
    constructor() {
        const has = typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;

        this.needsPermission = has && typeof DeviceOrientationEvent.requestPermission === 'function';
        this.supported = this.needsPermission;   // na iOS se to pozná až po povolení
        this.enabled = false;
        this.raw = 0;
        this.zero = null;
        this.angle = 0;
        this.side = null;

        this.onOrientation = event => this.#read(event);

        if (has && !this.needsPermission) {
            // Čidlo se ohlásí samo – první událost s číslem znamená, že je
            this.probe = event => {
                if (event.gamma === null && event.beta === null) return;
                this.supported = true;
                window.removeEventListener('deviceorientation', this.probe);
                if (readEnabled()) this.start();
            };
            window.addEventListener('deviceorientation', this.probe);
        }
    }

    /**
     * Přepne ovládání náklonem. Na iOS si při zapnutí řekne o povolení – proto
     * se musí volat z dotyku, ne odjinud. Vrací (příslibem) nový stav.
     */
    async toggle() {
        if (!this.supported) return false;

        if (this.enabled) {
            this.stop();
            return false;
        }

        if (this.needsPermission) {
            const verdict = await DeviceOrientationEvent.requestPermission().catch(() => 'denied');
            if (verdict !== 'granted') return false;
        }

        this.start();
        return true;
    }

    start() {
        if (this.enabled) return;

        this.enabled = true;
        this.zero = null;       // klidová poloha se vezme z prvního čtení
        this.angle = 0;
        this.side = null;
        window.addEventListener('deviceorientation', this.onOrientation);
        remember(true);
    }

    stop() {
        this.enabled = false;
        this.side = null;
        window.removeEventListener('deviceorientation', this.onOrientation);
        remember(false);
    }

    /** Znovu si zapamatuje, jak hráč telefon zrovna drží. */
    recalibrate() {
        this.zero = null;
        this.angle = 0;
        this.side = null;
    }

    /**
     * Kam se telefon naklání: `'left'`, `'right'`, nebo nic. Volá se jednou za
     * snímek – hra si z toho udělá stejný pokyn, jako by přišel z klávesnice.
     */
    read() {
        if (!this.enabled) return null;

        this.angle += ((this.raw - (this.zero ?? this.raw)) - this.angle) * SMOOTH;

        const limit = this.side ? TURN_OFF : TURN_ON;
        if (this.angle < -limit) this.side = 'left';
        else if (this.angle > limit) this.side = 'right';
        else this.side = null;

        return this.side;
    }

    #read(event) {
        if (event.gamma === null && event.beta === null) return;

        // Náklon přepočítaný do soustavy displeje: na výšku je to `gamma`,
        // na ležato se role os prohodí podle toho, jak je displej otočený.
        const screenAngle = (screen.orientation?.angle ?? window.orientation ?? 0) * Math.PI / 180;
        const gamma = event.gamma ?? 0;
        const beta = event.beta ?? 0;

        this.raw = gamma * Math.cos(screenAngle) - beta * Math.sin(screenAngle);
        if (this.zero === null) this.zero = this.raw;
    }
}

function remember(enabled) {
    try {
        localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
    } catch { /* v soukromém režimu nevadí, že se to nezapamatuje */ }
}

// Ve výchozím stavu je náklon vypnutý – zapíná se ikonou v HUD nebo klávesou
function readEnabled() {
    try {
        return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
        return false;
    }
}
