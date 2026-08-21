import {Level} from "../level.js";

// Soubor generuje tools/gen_mazes.py (otisk mapy 5c5e16ca).
// Ruční úpravu generátor podle otisku pozná a soubor nepřepíše;
// vynutit přegenerování jde přepínačem --force.
// První argument = rychlost běhu v % základní rychlosti (100 = BASE_SPEED).
const level4 = new Level(
    {speed: 112, theme: 'sewer'},
    "#####F###############",
    "#     #   #         #",
    "# ### # # ### ##### #",
    "# # # #*#   # CT H# #",
    "# # # # ### ##### # #",
    "# #   #S  #   #   # #",
    "# ### ##  ### ##### #",
    "#   # #   #    *  # #",
    "# # # # ######### # #",
    "# # # # *   #     # #",
    "### ####### #T##### #",
    "#H  #   * #P      # #",
    "# ### ### ####### # #",
    "#     #         # # #",
    "# ##### ## ###### # #",
    "#   # H           # #",
    "###*# ###### ## # # #",
    "# # #  T      # # #T#",
    "# # ####### # # # #*#",
    "#  H        # #     #",
    "#####################",
);

export {level4};
