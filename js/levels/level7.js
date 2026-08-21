import {Level} from "../level.js";

// Soubor generuje tools/gen_mazes.py (otisk mapy 9d49119e).
// Ruční úpravu generátor podle otisku pozná a soubor nepřepíše;
// vynutit přegenerování jde přepínačem --force.
// První argument = rychlost běhu v % základní rychlosti (100 = BASE_SPEED).
const level7 = new Level(
    {speed: 128, theme: 'kitchen'},
    "###########################",
    "# #    T        #  T*     #",
    "# # # ######### # ####### #",
    "#   # #   #       #   #   #",
    "# ### # ### ####### # #####",
    "# #   #     #       # H   #",
    "# # ### ##### ########### #",
    "#* H#       #     #     # #",
    "# ###### H####### # ### # #",
    "# #           S   # # # # #",
    "#T#  ######## ##### # # # #",
    "# # T   #           #     #",
    "# # ##### ########### ### #",
    "# # #TC # #* P#   T     #C#",
    "# # # # # # ##### ####### #",
    "#   H #   # #     #       #",
    "# ### ##### # ##### #######",
    "#   #   #   #   #   #     F",
    "# #####T# ### # # ####### #",
    "# #     # #   # # #*      #",
    "### # ###T##### #*### ### #",
    "#   # #   #       #     # #",
    "# ##### ### ### #*# ###S# #",
    "#   #   #   #  *# #   #   #",
    "# # # ### # ##### ### #  ##",
    "# #   #   #           #   #",
    "###########################",
);

export {level7};
