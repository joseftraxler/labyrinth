import {Game} from "./game.js";
import {level1} from "./levels/level1.js";
import {level2} from "./levels/level2.js";
import {level3} from "./levels/level3.js";
import {level4} from "./levels/level4.js";
import {level5} from "./levels/level5.js";
import {level6} from "./levels/level6.js";
import {level7} from "./levels/level7.js";
import {level8} from "./levels/level8.js";
import {level9} from "./levels/level9.js";
import {level10} from "./levels/level10.js";

const canvas = document.getElementsByTagName('canvas')[0];

const levels = [
    level1,
    level2,
    level3,
    level4,
    level5,
    // Od půlky hry jsou labyrinty větší, rychlejší a hlídané kočkami
    level6,
    level7,
    level8,
    level9,
    level10,
];

/**
 * Zatáčení je **relativní k myši**, ne ke světové straně: labyrint se pod ní
 * otáčí jako mapa v navigaci, takže „nahoru“ na klávesnici neznamená nic –
 * smysl dává jen doleva, doprava a zpátky.
 */
const controls = {
    'left': ['arrowLeft', 'keyA'],
    'right': ['arrowRight', 'keyD'],
    'back': ['space', 'arrowDown', 'keyS'],
    'pause': ['escape', 'keyP'],
    'restart': ['keyR'],
    'mute': ['keyM'],
    'haptics': ['keyH'],
};

// Instance je dostupná i z konzole prohlížeče – hodí se na ladění
// a používá ji automatický průchod levely (tools/playtest.mjs)
window.labyrinth = new Game(canvas, levels, controls);

// Service worker – umožní instalaci hry a běh offline (PWA)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        // '../sw.js' vůči tomuto modulu = kořen webu (scope celé hry)
        navigator.serviceWorker.register(new URL('../sw.js', import.meta.url)).catch(() => {});
    });
}

// labyrinth.levelIndex = 6;   // o jedna míň, než chceš
// labyrinth.nextLevel();      // posune na 8, vynuluje pokusy i postup
