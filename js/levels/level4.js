import {Level} from "../level.js";

// Soubor generuje tools/gen_mazes.py (otisk mapy 8d726519).
// Ruční úpravu generátor podle otisku pozná a soubor nepřepíše;
// vynutit přegenerování jde přepínačem --force.
// První argument = rychlost běhu v % základní rychlosti (100 = BASE_SPEED).
const level4 = new Level(
    {speed: 106, theme: 'sewer'},
    "#####F###############",
    "#     # T #         #",
    "# ### # # ### #####H#",
    "# # # # #   #     # #",
    "# # # # ### ##### # #",
    "# #   #*  #   #   # #",
    "# ### ##  ### ##### #",
    "#T* # #   #       # #",
    "# # # # ######### # #",
    "#C# # # H   # H   # #",
    "### #######*# ##### #",
    "#   #     #P      # #",
    "# ### ### ####### # #",
    "#*    #        *# # #",
    "# ##### ######### # #",
    "#  T# #           # #",
    "### # ###### ## # # #",
    "# # #  H   *  # # # #",
    "# # ####### # # # # #",
    "#S     T    # #     #",
    "#####################",
);

export {level4};
