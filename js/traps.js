/**
 * Časování nastražených pastí. Sklapovačka i propadlo jsou **čistou funkcí
 * místa a času** – z buňky se spočítá fáze, z fáze a herního času stav. Nic si
 * nepamatují a nic je nespouští.
 *
 * Je to stejný princip, na kterém stojí pohyblivé překážky: dokud je poloha
 * pastí funkce místa, umí generátor (`tools/gen_mazes.py`) level odsimulovat
 * a ověřit, že se dá projít. Kdyby past reagovala na myš, ověření by přestalo
 * platit – proto se pasti spouští podle hodin, ne podle hráče.
 *
 * `tools/gen_mazes.py` má vlastní kopii těchhle čísel i funkce `phase`;
 * když se tady něco změní, musí se to promítnout i tam.
 */

// Časy pastí jdou ruku v ruce s rychlostí běhu (`BASE_SPEED`): pomalejší myš je
// v dosahu pasti déle, takže se se zpomalením hry musí prodloužit i cyklus –
// jinak by se z čekací hádanky stala zkouška reflexů.
export const SNAP_PERIOD = 2.6;     // perioda sklapovačky (s)
export const SNAP_CLOSED = 0.85;    // jak dlouho je z toho sklapnutá (s)
export const SNAP_WARN = 0.45;      // varovné napnutí pružiny těsně před sklapnutím (s)

export const PIT_PERIOD = 3.4;      // perioda propadla (s)
export const PIT_OPEN = 1.30;       // jak dlouho je z toho otevřené (s)
export const PIT_WARN = 0.50;       // vrzání víka před otevřením (s)

/**
 * Fáze pasti v buňce jako podíl 0–1. Sousední pasti musí spouštět v různý čas –
 * jinak by se z řady sklapovaček stala jedna nepřekonatelná zeď.
 */
export function phase(x, y) {
    const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return v - Math.floor(v);
}

/** Kolik sekund uplynulo od posledního natažení sklapovačky v této buňce. */
export function snapTime(x, y, clock) {
    return (clock + phase(x, y) * SNAP_PERIOD) % SNAP_PERIOD;
}

/** Je sklapovačka v této buňce právě sklapnutá (a tedy smrtící)? */
export function snapClosed(x, y, clock) {
    return snapTime(x, y, clock) >= SNAP_PERIOD - SNAP_CLOSED;
}

/** Kolik sekund uplynulo od posledního zavření propadla v této buňce. */
export function pitTime(x, y, clock) {
    return (clock + phase(x, y) * PIT_PERIOD) % PIT_PERIOD;
}

/** Je propadlo v této buňce právě otevřené (a tedy smrtící)? */
export function pitOpen(x, y, clock) {
    return pitTime(x, y, clock) >= PIT_PERIOD - PIT_OPEN;
}

/**
 * Jak je sklapovačka zavřená: 0 = natažená, 1 = sklapnutá. Těsně před
 * sklapnutím se pružina znatelně chvěje – past má být nebezpečná, ne zákeřná,
 * takže hráč dostane varování dřív, než mu sklapne pod nosem.
 */
export function snapArm(x, y, clock) {
    const t = snapTime(x, y, clock);
    const closes = SNAP_PERIOD - SNAP_CLOSED;

    if (t >= closes) {
        const since = t - closes;
        return since < 0.06 ? 1.12 : 1;   // krátký záškub v okamžiku sklapnutí
    }
    if (t > closes - SNAP_WARN) {
        return 0.10 + 0.06 * Math.sin((closes - t) * 60);
    }
    return 0;
}

/** Jak je propadlo otevřené: 0 = zavřené víko, 1 = díra. Před otevřením vrže. */
export function pitLid(x, y, clock) {
    const t = pitTime(x, y, clock);
    const opens = PIT_PERIOD - PIT_OPEN;

    if (t >= opens) return Math.min(1, (t - opens) / 0.12);
    if (t > opens - PIT_WARN) return 0.08 * Math.sin((opens - t) * 45) + 0.08;
    return Math.max(0, 1 - (t / 0.18));   // víko se po zavření ještě dovírá
}
