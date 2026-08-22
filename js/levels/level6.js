import {Level} from "../level.js";

// Soubor generuje tools/gen_mazes.py (otisk mapy 5eae12eb).
// Ruční úpravu generátor podle otisku pozná a soubor nepřepíše;
// vynutit přegenerování jde přepínačem --force.
// První argument = rychlost běhu v % základní rychlosti (100 = BASE_SPEED).
const level6 = new Level(
    {speed: 110, theme: 'cellar'},
    "#########################",
    "#     # #         #     #",
    "# ### # # ### ### # ### #",
    "# # # # # # #   # # #   #",
    "# # # # #T# ### # # # ###",
    "#   # C     #   # H # # #",
    "### #T##### # ####### # #",
    "# # # #   # #T#         #",
    "# # # # # # # # ### ### #",
    "#   #   # # # #   # #   #",
    "# ####### # # ### # # ###",
    "#S#     # # #   # #  *  F",
    "# ##### # ##### #########",
    "# #   S #   #P#     #   #",
    "# #*### ### # ##### #  *#",
    "# #   # # # # #   #   # #",
    "# ### # # # # # # ##### #",
    "# #*T # # # #   #     # #",
    "# # ### # # ######### # #",
    "# #     T     H      H# #",
    "# ### ### ######### # # #",
    "# *   # # #     # #   # #",
    "####### # # ### # ##### #",
    "#  T       T#  H        #",
    "#########################",
);

export {level6};
