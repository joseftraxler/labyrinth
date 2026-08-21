import {Level} from "../level.js";

// Soubor generuje tools/gen_mazes.py (otisk mapy 122b940e).
// Ruční úpravu generátor podle otisku pozná a soubor nepřepíše;
// vynutit přegenerování jde přepínačem --force.
// První argument = rychlost běhu v % základní rychlosti (100 = BASE_SPEED).
const level3 = new Level(
    {speed: 108, theme: 'kitchen'},
    "#############F#####",
    "#*      #         #",
    "### ### # ##### # #",
    "#   #   # T # #  H#",
    "# ### ##### # ###*#",
    "# # #       #T  # #",
    "# # #### #### # # #",
    "# #       S # # T #",
    "#T# ####### #T#####",
    "#*#     #P# #   #*#",
    "# ##### # # ### # #",
    "# #   # # #     # #",
    "# # ### # ### ### #",
    "# #     #   # #   #",
    "# ######### # ### #",
    "# #   #     #     #",
    "# #*# # ##### # # #",
    "#   #  H          #",
    "###################",
);

export {level3};
