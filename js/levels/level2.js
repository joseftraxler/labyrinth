import {Level} from "../level.js";

// Soubor generuje tools/gen_mazes.py (otisk mapy 7b0c0ba9).
// Ruční úpravu generátor podle otisku pozná a soubor nepřepíše;
// vynutit přegenerování jde přepínačem --force.
// První argument = rychlost běhu v % základní rychlosti (100 = BASE_SPEED).
const level2 = new Level(
    {speed: 102, theme: 'cellar'},
    "#################",
    "#     #         #",
    "# ##### ### #####",
    "#   H #   # H T #",
    "##### ### ##### #",
    "#T    #       # #",
    "# ##### ##### # #",
    "# #   # #   # # #",
    "#T# # # # # ### #",
    "#   #    P# #   #",
    "#*######### # ###",
    "#*#     #   #   #",
    "### ###*  ##### #",
    "#   # #   #     #",
    "# ### ##### ### #",
    "#    *    *T#   #",
    "#############F###",
);

export {level2};
