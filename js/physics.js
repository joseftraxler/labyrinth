/**
 * Fyzikální konstanty hry. Jednotky: buňky labyrintu a sekundy.
 *
 * Myš běží sama po ose chodby a hráč jen říká, kam v příští křižovatce
 * zabočit (`js/entities/mouse.js`). Z těchto čísel plyne, jak rychle se
 * labyrint pod myší otáčí, jak dlouho platí požadavek na odbočku a jak blízko
 * musí být past, aby myš dostala.
 *
 * Když čísla změníš, přegeneruj úrovně (`python3 tools/gen_mazes.py`) –
 * generátor má vlastní kopii těchhle konstant a ověřuje jimi průchodnost map.
 */

export const BASE_SPEED = 5.2;      // rychlost běhu při 100 % (buněk/s)
export const TURN_RATE = 13;        // rychlost natáčení myši i kamery (rad/s)
export const TURN_BUFFER = 0.30;    // jak dlouho čeká požadavek na odbočku (s)

export const MOUSE_HIT = 0.36;      // poloměr myši pro smrtící dotyk (buňky)
export const SAW_HIT = 0.46;        // poloměr pily
export const CAT_HIT = 0.42;        // poloměr kočky

export const SAW_SPEED = 0.60;      // rychlost pily jako násobek rychlosti myši

/**
 * Kolik buněk na každou stranu od svého místa pila zajede. Krátká dráha je
 * záměr: pila, která by projížděla celou chodbu, by z jednopolíčkového průchodu
 * udělala závoru, které se nedá uhnout ani utéct. Takhle je z ní hádanka na
 * načasování – počkej, až odjede na druhý konec, a proběhni.
 */
export const SAW_REACH = 2;
export const CAT_SPEED = 0.72;      // kočka je schválně pomalejší než myš
export const CAT_SIGHT = 7;         // na kolik buněk kočka rovnou chodbou vidí
export const CAT_FORGET = 2.5;      // jak dlouho honí myš, kterou ztratila (s)

// Dosvit myšího zraku v buňkách – měří se **po chodbě**, ne vzdušnou čarou,
// takže za roh není vidět dál, než kam vede cesta. Je schválně větší než
// `CAT_SIGHT`: hráč musí kočku zahlédnout dřív, než ona jeho.
export const SIGHT = 9;
