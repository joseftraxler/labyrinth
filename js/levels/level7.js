import {Level} from "../level.js";

// Soubor generuje tools/gen_mazes.py (otisk mapy 5f71c113).
// Ruční úpravu generátor podle otisku pozná a soubor nepřepíše;
// vynutit přegenerování jde přepínačem --force.
// První argument = rychlost běhu v % základní rychlosti (100 = BASE_SPEED).
const level7 = new Level(
    {speed: 112, theme: 'kitchen'},
    "###########################",
    "# #     H       #  T*     #",
    "# # # ######### # ####### #",
    "#   # #   #     *H#   #   #",
    "# ### # ### ####### # #####",
    "# #   #     #C      #   *T#",
    "# # ### ##### ########### #",
    "#   #       #     #     # #",
    "# ###### ######## # ### # #",
    "# #           T   # # # # #",
    "# # ######### ##### # # # #",
    "# # S   #           #     #",
    "# # ##### ###########T### #",
    "# # #TC # #* P#         # #",
    "# # # # # # ##### ####### #",
    "#   H #   # #     #     * #",
    "# ### ##### # ##### #######",
    "#   #   #   #  S#   #     F",
    "# #####T# ### # # ####### #",
    "# #     # #*  # # # H     #",
    "### # ###T##### # ### ### #",
    "#   # #   #       #     # #",
    "# ##### ### ###T# # ### # #",
    "#   #   #   #  *# #   #   #",
    "# # # ### # ##### ### # ###",
    "# #   #   #           #   #",
    "###########################",
);

export {level7};
