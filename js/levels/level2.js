import {Level} from "../level.js";

// Soubor generuje tools/gen_mazes.py (otisk mapy 311ae85f).
// Ruční úpravu generátor podle otisku pozná a soubor nepřepíše;
// vynutit přegenerování jde přepínačem --force.
// První argument = rychlost běhu v % základní rychlosti (100 = BASE_SPEED).
const level2 = new Level(
    {speed: 104, theme: 'cellar'},
    "#################",
    "#T    #     T   #",
    "# #####T### # ###",
    "#     #   #     #",
    "##### ### ##### #",
    "#   * #       # #",
    "# # ### ##### #H#",
    "# #   # #   # # #",
    "# #*# # # # ### #",
    "#   #    P# #   #",
    "# ######### # ###",
    "# #  T* # H #   #",
    "### ###   ##### #",
    "#   #*#*  #     #",
    "# ### ##### ### #",
    "#           #   #",
    "#############F###",
);

export {level2};
