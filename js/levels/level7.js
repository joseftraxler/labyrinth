import {Level} from "../level.js";

// Soubor generuje tools/gen_mazes.py (otisk mapy dc91fac5).
// Ruční úpravu generátor podle otisku pozná a soubor nepřepíše;
// vynutit přegenerování jde přepínačem --force.
// První argument = rychlost běhu v % základní rychlosti (100 = BASE_SPEED).
const level7 = new Level(
    {speed: 112, theme: 'kitchen'},
    "###########################",
    "# #     T       #  T      #",
    "# # # ######### # ####### #",
    "#   # #   #     H #   #   #",
    "# ### # ### ####### # #####",
    "# #   #     #H      #   *T#",
    "# # ### ##### ###########*#",
    "#   #       #     #     # #",
    "# ###### ######## # ### # #",
    "# #           T   # # # # #",
    "# # #########*##### # # # #",
    "# # S   #           #     #",
    "# # ##### ###########T### #",
    "# # #C  # #  P#         # #",
    "# # # # # # ##### ####### #",
    "#   T #   # #     #     * #",
    "# ### ##### # ##### #######",
    "#   #   #   #  S#   #     F",
    "# #####T# ### # # ####### #",
    "# #     # #   # # # H     #",
    "### # ###C##### # ### ### #",
    "#   # #   #       #     # #",
    "# ##### ### ###T# # ### # #",
    "#   #   #  *#   # #   #   #",
    "# # # ### # ##### ### # ###",
    "# #   #   #           #H  #",
    "###########################",
);

export {level7};
