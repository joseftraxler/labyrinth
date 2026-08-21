import {Level} from "../level.js";

// Soubor generuje tools/gen_mazes.py (otisk mapy ada41e8f).
// Ruční úpravu generátor podle otisku pozná a soubor nepřepíše;
// vynutit přegenerování jde přepínačem --force.
// První argument = rychlost běhu v % základní rychlosti (100 = BASE_SPEED).
const level6 = new Level(
    {speed: 122, theme: 'cellar'},
    "#########################",
    "# *  H# #         #  T  #",
    "# ### # # ### ### # ### #",
    "# # # # # # #   # # #   #",
    "# #T# # # # ###*# # # ###",
    "#   #  T T  # T #   # # #",
    "### # ##### # ####### # #",
    "#C# #S#   # # #       H #",
    "# # # # # # # # ### ### #",
    "#   #   # #   #   # #   #",
    "# ####### # # ### # # ###",
    "# #*    # # #  T# #     F",
    "# #####S# ##### #########",
    "# #     #   #P# H   #   #",
    "# # ### ### # ##### #  *#",
    "# #   # # # # #     CH# #",
    "# ### # # # # # # ##### #",
    "# #   # # # #   #     # #",
    "# # ### # # ######### # #",
    "# #      *          * # #",
    "# ### ### ######### # # #",
    "#     # # #*    # #   #T#",
    "####### # # ### # ##### #",
    "#           #           #",
    "#########################",
);

export {level6};
