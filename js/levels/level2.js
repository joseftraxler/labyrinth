import {Level} from "../level.js";

// Soubor generuje tools/gen_mazes.py (otisk mapy 3413f972).
// Ruční úpravu generátor podle otisku pozná a soubor nepřepíše;
// vynutit přegenerování jde přepínačem --force.
// První argument = rychlost běhu v % základní rychlosti (100 = BASE_SPEED).
const level2 = new Level(
    {speed: 102, theme: 'cellar'},
    "#################",
    "#     #         #",
    "# ##### ### #####",
    "#   T #   # * T #",
    "##### ### ##### #",
    "#T    #       # #",
    "# ##### ##### # #",
    "# #   # #   # # #",
    "#T# # # # # ### #",
    "#   #    P# #   #",
    "# ######### # ###",
    "#*#     #   #   #",
    "### ###   ##### #",
    "#   # #   #     #",
    "# ### ##### ### #",
    "#    H    H*#   #",
    "#############F###",
);

export {level2};
