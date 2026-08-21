import {Level} from "../level.js";

// Soubor generuje tools/gen_mazes.py (otisk mapy fe711765).
// Ruční úpravu generátor podle otisku pozná a soubor nepřepíše;
// vynutit přegenerování jde přepínačem --force.
// První argument = rychlost běhu v % základní rychlosti (100 = BASE_SPEED).
const level5 = new Level(
    116,
    "#######################",
    "#     # #     #       #",
    "# ### #C# ###T# # #####",
    "#   #   #   #  H#     #",
    "# #S##### ########### #",
    "#   #     #         # #",
    "#   # ### # ####### # #",
    "# #     #   #     #T# #",
    "# ## #### ### ### #*# #",
    "#*#   #   T # # H #H# #",
    "# ### # ##### # ### # #",
    "#   # #   #P# #     # #",
    "### # ### # # ####### #",
    "#   # #   # #   #     #",
    "# # # #*### ### # ### #",
    "#     #   # #   #     #",
    "######### # # #######*#",
    "#  H    # # # #   T # #",
    "# # ### # # # # ### # #",
    "# #   # * #   #   #*  #",
    "#T# # ########### ### #",
    "#   #          T  #   #",
    "#################F#####",
);

export {level5};
