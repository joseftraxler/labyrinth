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

// Rychlost je schválně nízká: tohle není hra na rychlost, ale na to vyznat se
// v labyrintu. Myš musí stihnout přečíst chodbu dřív, než do ní vběhne.
export const BASE_SPEED = 2.35;     // rychlost běhu při 100 % (buněk/s)

/**
 * Jak rychle se myš otáčí, když hráč drží zatáčení (náklon, šipku, kraj
 * obrazovky). **Tohle je celé zatáčení** – myš se nikde neotočí sama a nikam
 * nezaskočí o 90°: labyrint se stáčí přesně tak dlouho, jak dlouho hráč drží.
 * Čtvrtotáčka trvá kolem 0,65 s, otočka zpátky dvakrát tolik.
 */
export const TURN_RATE = 2.4;       // rad/s

/**
 * Nejvyšší násobek `TURN_RATE`, kterým se dá otáčet. Prudce nakloněný telefon
 * stáčí labyrint dvakrát rychleji než šipka (`js/tilt.js`), ale výš už to nejde:
 * v rychleji rotujícím labyrintu hráč ztratí orientaci a plánek v rohu přestane
 * stačit.
 */
export const TURN_MAX = 2;

/**
 * Poloměr myšího tělíčka pro kolize se zdí. Chodba je široká jednu buňku, takže
 * z každé strany zbývá kolem dvou desetin buňky vůle – dost na to, aby se dalo
 * chodbou běžet i s trochu nakřivo namířeným čumákem, a málo na to, aby se dalo
 * proklouznout rohem.
 */
export const MOUSE_RADIUS = 0.28;

/**
 * Jak rychle myš zabrzdí a zase se rozjede (podíl rychlosti za sekundu).
 * Zastavení je jediný způsob, jak před pastí počkat – otáčení běh nezastaví –
 * ale nesmí to být přepínač: mezi během a stáním je krátký, čitelný okamžik.
 */
export const PACE_RATE = 5;

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
// Kočka je schválně pomalejší než myš a vidí kratší kus chodby, než kam dosáhne
// myší dosvit (`SIGHT`) – hráč ji tak zahlédne dřív než ona jeho a dá se jí
// utéct. Čísla drž raději níž: v pomalé hře se před kočkou couvá dlouho.
export const CAT_SPEED = 0.68;      // násobek rychlosti myši
export const CAT_SIGHT = 6;         // na kolik buněk kočka rovnou chodbou vidí
export const CAT_FORGET = 2.0;      // jak dlouho honí myš, kterou ztratila (s)

// Dosvit myšího zraku v buňkách – měří se **po chodbě**, ne vzdušnou čarou,
// takže za roh není vidět dál, než kam vede cesta. Je schválně větší než
// `CAT_SIGHT`: hráč musí kočku zahlédnout dřív, než ona jeho.
export const SIGHT = 9;
