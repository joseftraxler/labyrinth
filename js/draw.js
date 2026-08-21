/**
 * Drobné pomůcky pro kreslení, které potřebuje hra i všechna prostředí
 * (`js/themes/`). Jsou tady, aby je nemusel každý soubor opisovat – a taky
 * proto, že `noise` drží pravidlo, na kterém stojí celé vykreslování: kresba
 * se počítá z místa, ne z pořadí, takže se při otáčení labyrintu nepřeskládá.
 */

export const TAU = Math.PI * 2;

// Stálé „náhodné“ číslo 0–1 pro dané zadání – aby se kresba mezi snímky
// neměnila, ale přitom nebyla pravidelná (spáry ve zdi, drobky, plíseň)
export function noise(seed) {
    const v = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
    return v - Math.floor(v);
}

// Zbytek po dělení, který pro záporná čísla vrací kladnou hodnotu
export function wrap(value, size) {
    return ((value % size) + size) % size;
}

// Nejkratší rozdíl dvou úhlů (−π … π) – kudy se otočit blíž
export function angleDiff(from, to) {
    return wrap(to - from + Math.PI, TAU) - Math.PI;
}

// Cesta zaobleného obdélníku (bez vykreslení – volající si zvolí fill/stroke)
export function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

// Směry po mřížce v pořadí, ve kterém je bere celá hra (0 = doprava, po směru
// hodinových ručiček). `dir ^ 2` je proto vždycky obrácený směr.
export const DIRS = [
    {x: 1, y: 0},
    {x: 0, y: 1},
    {x: -1, y: 0},
    {x: 0, y: -1},
];

// Úhel směru v radiánech (osa x doprava, osa y dolů jako na plátně)
export function dirAngle(dir) {
    return dir * Math.PI / 2;
}
