import {Level} from "../level.js";

// Soubor generuje tools/gen_mazes.py (otisk mapy cdbb478a).
// Ruční úpravu generátor podle otisku pozná a soubor nepřepíše;
// vynutit přegenerování jde přepínačem --force.
// První argument = rychlost běhu v % základní rychlosti (100 = BASE_SPEED).
const level1 = new Level(
    100,
    "###############",
    "#  *#         #",
    "# ### ##### # #",
    "# # * #   # # #",
    "# # ### # # ###",
    "# # * # #T# T #",
    "# ### # # ### #",
    "#   # #P      #",
    "# # # ##### # #",
    "# # # #   #   #",
    "# # # # # #####",
    "# #   # #     #",
    "# ####### ### #",
    "#         #*  #",
    "###########F###",
);

export {level1};
