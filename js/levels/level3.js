import {Level} from "../level.js";

// Soubor generuje tools/gen_mazes.py (otisk mapy 24f30117).
// Ruční úpravu generátor podle otisku pozná a soubor nepřepíše;
// vynutit přegenerování jde přepínačem --force.
// První argument = rychlost běhu v % základní rychlosti (100 = BASE_SPEED).
const level3 = new Level(
    {speed: 104, theme: 'kitchen'},
    "#########F#########",
    "#       #       T #",
    "### ### # ##### # #",
    "#*  #   #   # #*  #",
    "# ### ##### # ### #",
    "# # #*      #   # #",
    "# # ######### # # #",
    "#*#         # #   #",
    "# #S####### # #####",
    "# #   T #P# #   # #",
    "# ##### # # ### # #",
    "# #   # # #     # #",
    "# # ### # ###H### #",
    "#T#  T  #   # #   #",
    "# ######### # ### #",
    "# #   #     #     #",
    "# # # # ####### # #",
    "#   #  T       H  #",
    "###################",
);

export {level3};
