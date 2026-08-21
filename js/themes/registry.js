import {Default} from "./default.js";
import {Cellar} from "./cellar.js";
import {Kitchen} from "./kitchen.js";
import {Sewer} from "./sewer.js";

/**
 * Jméno tématu v mapě levelu (`{speed, theme}`) → třída prostředí. Je to
 * **jediné místo v celé hře, kde se téma pozná podle jména**; všude jinde se
 * hra ptá instance. Nové prostředí se přidává sem (a do `ASSETS` v `sw.js`).
 */
const THEMES = {
    cellar: Cellar,
    kitchen: Kitchen,
    sewer: Sewer,
};

/**
 * Prostředí pro daný level. Bez tématu (a u neznámého jména) jsou to kamenné
 * katakomby, se kterými hra začínala.
 *
 * @param {string|null} name
 * @param {import("../game.js").Game} game
 * @returns {import("../theme.js").Theme}
 */
export function themeFor(name, game) {
    return new (THEMES[name] ?? Default)(game);
}
