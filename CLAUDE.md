# CLAUDE.md

Pokyny pro práci na této hře. Drž se jich, ať zůstane konzistentní.

## Co to je

Bílá myš utíká ze středu labyrintu ven. Čistý JavaScript (ES moduly), celé to
běží na HTML `<canvas>`. Bez frameworků, bez závislostí, bez build kroku.

Hra je stavěná podle stejných pravidel jako `joseftraxler/cube-runner` – stejná
architektura (`Game` řídí, entity a prostředí se starají samy o sebe), stejný
způsob zápisu levelů, stejný generátor s ověřením průchodnosti, stejná PWA.

## Spuštění a testování

ES moduly se **nenačtou přes `file://`** – je nutný statický HTTP server:

```bash
python3 -m http.server 8000   # pak http://localhost:8000
```

Není žádný test runner ani linter. Co ale existuje a **po zásahu do pohybu,
pastí nebo levelů se má pustit**:

```bash
python3 tools/gen_mazes.py --check          # ověří simulací, že jdou levely projít
python3 tools/gen_mazes.py --verify js/levels/level7.js   # totéž pro hotovou mapu
python3 tools/gen_mazes.py --paths js/levels/level7.js    # vypíše cestu k východu
node tools/playtest.mjs                     # projde všech 10 levelů v Chromiu
node tools/playtest.mjs --level 4 --trace   # kudy autopilot běžel (na ladění)
node tools/screenshot.mjs                   # náhledy do docs/
```

Nástroje v Node.js potřebují Chromium přes `playwright` (`npm i -D playwright`) –
proto nejsou součástí hry, jen vývoje. `node tools/playtest.mjs --headed` ukáže,
co se v prohlížeči děje. Generátor běží na čistém Pythonu 3, bez balíčků.

## Architektura a klíčový princip

**Vazba jde jen jedním směrem: `Game` řídí, entity i prostředí se starají samy
o sebe.**

- `Game` (`js/game.js`) orchestruje hru: herní smyčka, stavy, kamera, dosvit,
  kolize s nástrahami, sýr, skóre, HUD a rozhodnutí, **kdy a kam** se co
  vykreslí.
- Entity (`js/entities/`) **nesmí ovládat hru**. Nemění skóre ani stav hry.
  Do světa jen *nahlížejí* kvůli vlastnímu pohybu (`this.game.level`, kočka
  navíc polohu myši). `Mouse` si řeší jen svůj běh a hlásí `stalled`, když stojí
  čelem u zdi – že se pak čeká na hráče, rozhoduje `Game`.
- `Entity` (`js/entities/entity.js`) drží startovní pozici, `reset()` a čas
  `animPhase`. `Entity.draw(ctx, cx, cy, size)` je abstraktní a **nesahá na
  `this.game`** – kontext i pozici dostane parametrem. Tuhle nezávislost
  zachovej; převlek podle světa maluje `Theme.decorateSaw` až přes hotovou
  kresbu (volá to `Game.drawActors`).
- `Runner` (`js/entities/runner.js`) je společný pohyb myši i kočky po mřížce.
  Liší se jen `chooseDir()`: u myši rozhoduje hráč, u kočky její vlastní hlava.
  Pozor: `reset()` běží ještě z konstruktoru předka, takže všechno, co z něj
  voláš, musí být **veřejná metoda** – soukromé metody podtřídy v tu chvíli
  ještě neexistují (`place`, `firstWayOut`).
- **Prostředí je třída, ne podmínka.** Každé téma má vlastní soubor
  v `js/themes/` a je to potomek `Theme` (`js/theme.js`): kreslí podlahu, zdi,
  sýr, pasti, doupě, východ a vzduch nad obrazem a vrací motiv hudby (`audio()`).
  `Game` si prostředí drží v `this.theme` (staví ho `themeFor`
  v `js/themes/registry.js`) a **nikde se nevětví podle jména tématu** – jediné
  místo, kde se jméno na třídu převádí, je ten registr. Nová podmínka
  `if (theme === …)` v `game.js` znamená, že v `Theme` chybí metoda.
  Sama `Theme` je zároveň prostředí levelů bez tématu (kamenné katakomby), takže
  si každý svět přepisuje jen to, čím se liší.
- **Časování pastí je čistá funkce místa a času** (`js/traps.js`). Sklapovačka
  ani propadlo si nic nepamatují a nespouští je myš – jen hodiny. Bez toho by
  generátor nemohl level odsimulovat a ověření průchodnosti by přestalo platit.
- Stav pokusu žije v `Game`: sebraný sýr, postup (`progress`/`best`), pokus.
  `loadLevel` level znovu rozparsuje, takže se po smrti sýr obnoví.
- **Nástrahy se hýbou jen ve stavu `playing`** (`Game.update` je krokuje až za
  kontrolou stavu). Herní čas `clock` je tím pádem přesně odehraný čas.

Ostatní moduly: `level.js` (parsování labyrintu, vzdálenosti k východu),
`physics.js` (konstanty pohybu), `traps.js` (časování pastí), `input.js`
(mapování kláves na akce), `audio.js` (zvuk), `haptics.js` (vibrace), `draw.js`
(sdílené pomůcky – `noise`, `angleDiff`, `DIRS`, `TAU`), `scripts.js` (bootstrap).

Instance hry visí na `window.labyrinth` – sahá po ní ladění v konzoli i nástroje
(`playtest.mjs`, `screenshot.mjs`), takže ji tam nech.

## Kamera: labyrint se otáčí, myš ne

Myš je pořád na stejném místě obrazovky (vodorovně uprostřed, svisle v 62 %
výšky – dopředu musí být vidět víc než dozadu) a míří vzhůru; otáčí se svět
kolem ní, jako mapa v navigaci. Dělá to `Game.applyCamera`: posun na místo myši,
otočení o `-π/2 − heading`, posun o polohu myši ve světě.

Z toho plynou dvě pravidla:

- **Kresba nesmí mít „nahoře“.** Dlaždice podlahy i zdi se otáčejí s labyrintem,
  takže cokoliv, co dává smysl jen v jedné poloze (stín zleva, tráva navrchu),
  bude jednou vzhůru nohama. Ozdoby drž souměrné.
- **Světlo a atmosféra se nekreslí do světa, ale přes něj.** `Game.drawLamp`,
  `Game.drawFog` a `Theme.drawAir` běží až po `ctx.restore()`, bez otáčení – je
  to světlo, které myš nese s sebou, ne kus mapy.

`Mouse.heading` se za směrem opožďuje (`TURN_RATE`) a **schválně pomaleji, než
trvá přeběh buňky**: zahnutí je v mřížce skok, ale na obrazovce z něj má být
pozvolné otočení mapy, ne cuknutí. Čtvrtotáčka trvá kolem 0,3 s, otočka zpátky
dvakrát tolik.

## Minimapa: jediné místo, které se neotáčí

V pravém horním rohu je plánek celého labyrintu (`Game.drawMinimap`) – slabě
celý tvar chodeb, přes něj zeleně to, kudy už myš prošla, k tomu východ, doupě
a tečka s čárkou, kam je myš otočená. **Sever je na plánku nahoře i tehdy, když
se svět pod myší otáčí**: od toho plánek je, podle otáčející se mapy se plánovat
nedá. Čárka směru je proto povinná, jinak by hráč nespojil plánek s tím, co vidí.

Kreslí se ze dvou předkreslených obrázků (`mapPlan`, `mapTrail`) – celý labyrint
a k tomu prošlé chodby, do kterých se přimalovává po jedné buňce v
`updateVisibility`. V každém snímku jsou to tím pádem dvě `drawImage` a pár
teček; překreslují se jen při změně levelu nebo velikosti okna (`resize`
je zahazuje **vždycky**, protože velikost plánku plyne z rozměru okna, ne
z velikosti buňky).

## Dosvit: vidět je jen kus labyrintu

`Game.updateVisibility` prohledá labyrint od myši do vzdálenosti `SIGHT` –
ale **po chodbách, ne vzdušnou čarou**. Za roh je proto vidět jen tam, kam vede
cesta, a labyrint se odkrývá po kusech. Kreslí se jen ty buňky (a zdi kolem
nich), takže je to zároveň to, co drží počet kreslicích volání nízko.

Dosvit myši je schválně **větší než dohled kočky** (`SIGHT` > `CAT_SIGHT`):
hráč musí kočku uvidět dřív než ona jeho.

## Výkon

Hra běží na telefonech, takže **na snímek je rozpočet pár milisekund**:

- **Nejdražší je rasterizace, ne JavaScript.** Podlaha a zdi se proto
  předkreslují do dlaždic (`Game.bake` volá `Theme.paintFloor`/`paintWall`)
  a v každém snímku se jen kopírují. Mezipaměť platí pro téma a velikost buňky –
  zahazuje ji `#dropStaleCaches` v `resize()` **a v `loadLevel()`** (jinak by
  kuchyň vypadala jako katakomby).
- **Kresli jen to, na co je vidět.** Mimo dosvit se nekreslí nic; zdi se berou
  z okolí viditelných buněk.
- **Podoba dlaždice se vybírá ze souřadnic buňky**, ne z pořadí kreslení – jinak
  by se kresba při otáčení labyrintu přeskládávala. Totéž platí pro cokoliv, co
  používá `noise` z `js/draw.js`.

## Ovládání

Klávesy, dotyk i myš vedou do jedné metody `Game.handleAction(action)` (action =
`left`/`right`/`back`/`pause`/`restart`/`mute`/`haptics`). Nové vstupy směruj
taky tam, ať se logika neduplikuje.

**Zatáčení je relativní k myši, ne ke světové straně.** Labyrint se pod ní
otáčí, takže „nahoru“ nedává smysl; smysl dává doleva, doprava a zpátky.
Klávesnice to mapuje přes `input.js`, dotyk a myš řeší `Game.bindPointer`:
horní pruh = pauza (jeho pravý roh zvuk, pruh vedle vibrace), zbytek plochy je
rozdělený na tři svislé pásy – krajní zatáčejí, prostřední otočí myš zpátky.

Do horního pruhu se na telefonu všechno nevejde, takže `drawHud` texty **měří
a zkracuje po stupních**: nejdřív zmizí počet pokusů, pak stav sýra.

## Pohybový model

Myš běží sama po ose chodby a **rozhoduje se jen ve středech buněk**
(`Runner.step`). Stav je buňka posledního rozhodnutí (`cx`, `cy`), směr (`dir`)
a ujetá vzdálenost od jejího středu (`off` v rozsahu 0–1); poloha `x`, `y` se
z toho počítá, ne naopak.

- **Rovně, doprava, doleva** (`Runner.followCorridor`) – v tomhle pořadí se
  hledá cesta, když hráč nic neřekl. Zatáčky v chodbě tedy myš projede sama
  a hráč rozhoduje jen na křižovatkách; když nikam nemůže, zastaví (`stalled`)
  a čeká, až ji někdo otočí.
- **Požadavek na zatáčku se pamatuje `TURN_BUFFER` sekund.** Bez toho by se
  hráč musel trefit přesně do křižovatky.
- **Otočka (`back`) je okamžitá** a nečeká na střed buňky – ve slepé uličce není
  na co čekat. Je to zároveň jediný způsob, jak počkat před pastí: myš popoběhne
  zpátky a vrátí se v jinou chvíli.
- Zeď **nezabíjí**. Myš není kostka z cube-runneru; do zdi se jen zapře.

**Běh je schválně pomalý** (`BASE_SPEED`, rychlost levelů roste jen ze 100 na
120 %). Tohle není hra na rychlost, ale na vyznání se v labyrintu: myš musí
stihnout přečíst chodbu dřív, než do ní vběhne. Kdo chce přitvrdit, ať přidá
na spletitosti mapy (`MIN_RUN`, míň smyček), ne na rychlosti.

Konstanty jsou v `js/physics.js` a časování pastí v `js/traps.js`. **Když je
změníš, přegeneruj a přeověř úrovně** – `tools/gen_mazes.py` má vlastní kopii
obojího a musí sedět.

## Nástrahy

Čtyři druhy, a každá je nebezpečná jinak:

- **Sklapovačka (`T`)** a **propadlo (`H`)** jsou čekací hádanky: cyklicky se
  zavřou a otevřou, fázi mají z vlastní buňky (`phase` v `js/traps.js`), takže
  řada pastí vedle sebe nespouští naráz. Délka cyklu jde ruku v ruce s rychlostí
  běhu (`BASE_SPEED`) – pomalejší myš je v dosahu pasti déle, takže se se
  zpomalením hry musí prodloužit i cyklus, jinak z čekací hádanky bude zkouška
  reflexů. Před sklapnutím se pružina chvěje
  a před otevřením víko vrže – past má být nebezpečná, ne zákeřná.
- **Pila (`S`)** jezdí sem a tam po **krátkém** úseku chodby (`SAW_REACH`
  buňky na každou stranu). Krátký je schválně: myš je rychlejší než pila, takže
  by ji v dlouhé rovné chodbě vždycky dojela zezadu a proti ní by se neprotáhla –
  z chodby by nebyla past, ale zeď. Generátor navíc pilu postaví jen tam, kde
  **uvnitř její dráhy je odbočka** a kde kolem vede i jiná cesta.
- **Kočka (`C`)** hlídkuje a myš, kterou uvidí rovnou chodbou, honí. Je
  schválně pomalejší (`CAT_SPEED`) a vidí kratší kus chodby než myš, takže se
  jí dá utéct. Ve slepé uličce se sama otočí – zaseknutá kočka by přestala být
  hrozbou.

Hitboxy jsou menší než buňka (`MOUSE_HIT`, `SAW_HIT`, `CAT_HIT`), ať hra
odpouští těsné proběhnutí.

## Formát levelu

`new Level(speed, ...rows)`:

- **`speed`** = rychlost běhu v **procentech základní rychlosti** (100 =
  `BASE_SPEED`). Skutečnou rychlost počítá `Game.loadLevel`.
- **řádky mapy** – legenda: `#` zeď, mezera chodba, `P` doupě uprostřed (start),
  `F` východ v obvodové zdi, `*` sýr, `T` sklapovačka, `H` propadlo, `S` pila,
  `C` kočka.
- místo čísla jde předat `{speed, theme}`; jméno tématu si `Game` vymění za
  třídu prostředí (`js/themes/`), takže **kresba i hudba světa jsou v jednom
  souboru**. `'cellar'` je sklep (cihly, hlína, prach ve vzduchu), `'kitchen'`
  kuchyň (kachlíky, drobky, linoleum), `'sewer'` kanál (beton, voda, kapky).
  Bez tématu jsou to kamenné katakomby.
- **Světy se střídají, nejdou po blocích** – hráč tak vidí všechna prostředí od
  začátku. Bez tématu zůstávají levely 1, 5 a 9; i „žádné téma“ je prostředí
  a taky se střídá.

Mimo mapu je zeď: labyrint je uzavřený a ven vede jen `F`. Sýr je nepovinný,
level končí doběhnutím k východu.

## Generování a ověřování úrovní

Labyrinty staví `tools/gen_mazes.py` (`python3 tools/gen_mazes.py`) podle
`LEVEL_PLAN` a přepíše `js/levels/*.js`. Postup: vyhloubit labyrint
prohledáváním do hloubky, probourat pár zdí navíc (`braid` – smyčky dávají
prostor manévrovat a bez nich není před kočkou kam uhnout), prorazit východ
nejdál od doupěte, rozmístit nástrahy a **odsimulovat, že se to dá projít**.

Pravidla rozmístění, bez kterých se levely rozsypou (`furnish`):

- **Mezi dvěma nástrahami musí zbýt aspoň dvě volné buňky** (`SPACING`). Čeká se
  popobíháním tam a zpátky a otočka padne doprostřed buňky – se dvěma pastmi
  obtékajícími jedinou volnou buňku by nebylo kde počkat a hráč by musel trefit
  dvě chvíle naráz.
- **Na dráze pily nesmí být nic jiného** a pila nesmí stát v jediné cestě
  k východu (`is_bridge`) ani v chodbě, která končí slepě.
- **Kočka nesmí čekat u doupěte** – myš musí mít čas se rozeběhnout.
- **Cesta k východu musí být aspoň `MIN_RUN`× delší než strana labyrintu**,
  jinak by hráč vyběhl ven dřív, než by zjistil, kudy běží. Je to hlavní páka
  na obtížnost: labyrint má být spletitý, ne rychlý.
- **Smyček (`loops`) jen pár.** Každá probouraná zeď dělá z labyrintu mřížku,
  ve které se nedá zabloudit; bez jediné by zase nebylo před kočkou kam uhnout.
  Ve výchozím plánu jich je zhruba desetina strany labyrintu.

Ověření (`find_path`) hledá posloupnost přeběhů **po vrstvách času**: přeběh
mezi sousedními buňkami trvá vždycky stejně, takže je čas ve vrstvě přesně daný.
Myš se může kdykoliv otočit, takže „čekání“ před pastí je v grafu obyčejné
popobíhání tam a zpátky a nemusí se modelovat zvlášť. Když level neprojde,
skript skončí chybou a nic nezapíše.

**Kočky se neověřují**: reagují na hráče, takže by výsledek stejně neplatil.
Férové je to i bez toho, protože kočka je pomalejší a myš ji uvidí dřív.

Ručně upravenou mapu generátor **nepřepíše**: v hlavičce každého souboru je
otisk mapy a když nesedí na obsah, soubor se přeskočí (`--force` to vynutí).
Takový level pak neodpovídá plánu – ověřuj ho přes
`python3 tools/gen_mazes.py --verify js/levels/levelX.js`.

`tools/playtest.mjs` totéž ověří proti opravdovému kódu hry: pustí hru
v Chromiu a **odehraje ji autopilotem** – ten drží nejkratší cestu k východu,
před zavřenou pastí radši počká (popoběhne zpátky a vrátí se), pile a kočce
uhne a chodbu, kudy to nejde, si odepíše a spočítá cestu jinudy. Nekouká
generátoru do karet: kdyby hra a simulace přestaly sedět, playtest to pozná.
Protože je hra i autopilot deterministický, pamatuje si autopilot ještě místa,
kde umřel – jinak by každý další pokus dopadl přesně stejně.

### Přidání levelu

1. Přidej řádek do `LEVEL_PLAN` v `tools/gen_mazes.py`.
2. Spusť generátor – vznikne `js/levels/levelX.js`.
3. Naimportuj a přidej do pole `levels` v `js/scripts.js`. Pořadí = pořadí ve hře.
4. Přidej soubor do `ASSETS` v `sw.js` a zvyš verzi `CACHE`.
5. Pusť `node tools/playtest.mjs`.

### Přidání prostředí

1. Založ `js/themes/<jméno>.js` s potomkem `Theme` – povinné je jen `name()`,
   zbytek přepiš jen tam, kde se svět liší od výchozího vzhledu.
2. Zapiš ho do `THEMES` v `js/themes/registry.js` (jediné místo, kde se jméno
   z mapy převádí na třídu).
3. Doplň téma do `LEVEL_PLAN` v generátoru a nápěvy do `PHRASES` v `js/audio.js`.
4. Přidej soubor do `ASSETS` v `sw.js` a zvyš verzi `CACHE`.

## Zvuk

`js/audio.js` (třída `Sound`) skládá efekty i hudbu za běhu přes Web Audio API –
**žádné zvukové soubory**, ať zůstane hra bez závislostí a repozitář bez binárek.
Vazba je stejná jako u entit: `Game` zvuku říká, co se stalo (`play('cheese')`)
a jestli má hrát hudba (`setMusicOn`), zvuk o hře nic neví.

- AudioContext smí vzniknout **až po interakci uživatele** – proto se `unlock()`
  volá z `handleAction`. Do té doby je `sound.ctx` null a `play()` nic nedělá.
- Hudba je krokový sekvencer plánovaný dopředu (`LOOKAHEAD`) na vlastním
  časovači, ne v herní smyčce – jinak by při propadu snímků vynechávala.
- **Co se hraje, ví prostředí** (`Theme.audio()` – stupnice, základní tón, tempo,
  aranžmá), *jak* se to hraje, ví `audio.js`. Nápěvy jsou **napsané** (`PHRASES`),
  ne losované: náhodné tóny dají procházku po stupnici, ne motiv. Level si
  vybere obměnu podle svého čísla, takže dva levely téhož světa nezní stejně.
- Sklapnutí pasti opodál je slyšet (`Game.hearTraps`) – je to varování, ne
  ozdoba: hráč má poznat rytmus pastí dřív, než k nim doběhne.

## Haptika

`js/haptics.js` posílá krátké vibrace k jednotlivým událostem (stejná jména jako
u zvuku). Vibruje se **jen ke krátkým jednorázovým věcem** – motor v telefonu se
rozjíždí i doběhává, takže by se dlouhé vzory slily v hučení. Zatáčení proto
nevibruje: v labyrintu se zatáčí každou chvíli.

## PWA

`sw.js` je network-first: hra je malá a aktuálnost je důležitější než pár set
milisekund, ale bez sítě odpoví cache, takže jde hrát offline. **Nový soubor
přidej do `ASSETS` a zvyš verzi `CACHE`**, jinak ho lidem s nainstalovanou hrou
service worker nikdy nestáhne.
