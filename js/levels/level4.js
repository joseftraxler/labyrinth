import {Level} from "../level.js";

// Soubor generuje tools/gen_mazes.py (otisk mapy 1442e329).
// Ruční úpravu generátor podle otisku pozná a soubor nepřepíše;
// vynutit přegenerování jde přepínačem --force.
// První argument = rychlost běhu v % základní rychlosti (100 = BASE_SPEED).
const level4 = new Level(
    {speed: 106, theme: 'sewer'},
    "#####F###############",
    "#     #   #    H    #",
    "# ### # # ### #####H#",
    "# # # # # * #     # #",
    "# # #H# ### ##### # #",
    "# #   #*  #   #   # #",
    "# ### ##  ### ##### #",
    "#   # #   #       # #",
    "# #T# # ######### # #",
    "# # # # H   # T   # #",
    "### #######*# ##### #",
    "#   #     #P      # #",
    "# ### ### ####### # #",
    "#*    #        C# # #",
    "# ##### ######### # #",
    "#  T#             # #",
    "### # ###### ## # # #",
    "# # #         # # #T#",
    "# # ####### # # # # #",
    "#    S      # #     #",
    "#####################",
);

export {level4};
