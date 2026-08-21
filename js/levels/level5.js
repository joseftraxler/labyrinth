import {Level} from "../level.js";

// Soubor generuje tools/gen_mazes.py (otisk mapy cf421fbb).
// Ruční úpravu generátor podle otisku pozná a soubor nepřepíše;
// vynutit přegenerování jde přepínačem --force.
// První argument = rychlost běhu v % základní rychlosti (100 = BASE_SPEED).
const level5 = new Level(
    108,
    "#######################",
    "#     # #   T #       #",
    "# ### # # ### # # #####",
    "#   #   #   #   #     #",
    "# # ##### ########### #",
    "#*H #     #         # #",
    "#*# # ### # ####### # #",
    "# #     #   # T   #T# #",
    "# ####### ### ### # #*#",
    "# #   #   T # # * # # #",
    "# ### # ##### # ### # #",
    "#   # #   #P# #     # #",
    "### # ###H# # ####### #",
    "#   # #   # #   #   S #",
    "# # # # ### ### # ### #",
    "#   CT#   # #   #     #",
    "######### # # ####### #",
    "#     T # # # #   H # #",
    "# # ### # # # # ### # #",
    "#H#   #   #   #   #   #",
    "# # # ########### ### #",
    "#   #     *       #*  #",
    "#################F#####",
);

export {level5};
