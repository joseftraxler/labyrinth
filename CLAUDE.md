# CLAUDE.md

Pokyny pro práci na této hře. Drž se jich, ať zůstane konzistentní.

## Co to je

Bílá myš utíká ze středu labyrintu ven – ale **ne dřív, než posbírá všechen
sýr**: teprve poslední kousek otevře vrátka do myšího ráje. Čistý JavaScript
(ES moduly), celé to běží na HTML `<canvas>`. Bez frameworků, bez závislostí,
bez build kroku.

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
node tools/tilttest.mjs                     # ovládání nakláněním (emulované čidlo)
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
- **Východ otevírá poslední sýr.** Jestli jsou vrátka zavřená, ví `Level`
  (`exitOpen`, `isBarred`) – sýr si drží `Level`, takže to nikam jinam nepatří.
  Kolize se ptají na `blocks` (zeď **nebo** zavřená mříž), tvar mapy dál na
  `isWall`: dosvit, vzdálenosti i plánek musí ukazovat celý labyrint, jinak by
  východ do otevření zmizel. `Game` z toho řeší jen to, co je jeho: kdy vrátka
  cvakla (`gateOpen` kvůli animaci a zvuku) a že útěk platí až otevřenými vrátky.
- **Za východem je ráj, ne zeď.** Východ leží v obvodové zdi a na druhou stranu
  z něj vede ven (`Level.exitOut`, `exitAngle`); tam se místo dlaždice zdi kreslí
  louka se sýrovými koly (`Theme.drawExit`, `drawParadise`, `drawGate`) a po
  doběhnutí tam myš vyběhne (`Mouse.runFree`, krokuje ji `Game.update` ve stavu
  `complete`). Bez toho by cíl celé hry byl puntík ve slepé uličce.
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
  bude jednou vzhůru nohama. Ozdoby drž souměrné. Jediná výjimka jsou vrátka do
  ráje: ta nemají nahoře, ale **ven** (`Level.exitAngle`) – a to se otáčí spolu
  se zdí, ve které stojí.
- **Světlo a atmosféra se nekreslí do světa, ale přes něj.** `Game.drawLamp`,
  `Game.drawFog` a `Theme.drawAir` běží až po `ctx.restore()`, bez otáčení – je
  to světlo, které myš nese s sebou, ne kus mapy.

**Otáčí hráč, ne hra.** Natočení myši se mění jen tím, že hráč drží zatáčení
(náklon telefonu, šipku, kraj obrazovky). Základní rychlost je `TURN_RATE`
(čtvrtotáčka kolem 0,65 s), náklonem telefonu jde podle jeho sklonu otáčet
pomaleji i rychleji, nejvýš však dvojnásobkem (`TURN_MAX`). Myš se nikde neotočí sama
a nikdy nikam neskočí o 90°; labyrint se stáčí přesně tak dlouho a tak rychle,
jak dlouho a jak moc hráč drží.

## Minimapa: jediné místo, které se neotáčí

V pravém horním rohu je plánek celého labyrintu (`Game.drawMinimap`) – slabě
celý tvar chodeb, přes něj zeleně to, kudy už myš prošla, k tomu východ (zavřený
jen obrysem, otevřený blikavě), doupě, tečky sýra, **který myš viděla a nechala
ležet**, a tečka s čárkou, kam je myš otočená. Neviděný sýr se nekreslí: sýr je
povinný, ale najít se pořád musí. **Sever je na plánku nahoře i tehdy, když
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

Klávesy, dotyk, myš i náklon telefonu vedou do jedné metody
`Game.handleAction(action)` (action = `left`/`right`/`wait`/`pause`/`restart`/
`mute`/`haptics`/`tilt`), puštění do `Game.handleRelease(action)`. Nové vstupy
směruj taky tam, ať se logika neduplikuje.

**Zatáčení je relativní k myši, ne ke světové straně.** Labyrint se pod ní
otáčí, takže „nahoru“ nedává smysl; smysl dává doleva, doprava a zpátky.

**Všechno se drží, neťuká.** `Game.held` si pamatuje zatáčení a `Game.waiting`
zastavení; každý snímek se obojí předá myši (`Game.update`). Ťuknutí je jen
krátké držení. Otočka o 180° není zvláštní akce – prostě se drží zatáčení dýl.

`Mouse.steer` nedostává stranu, ale **násobek `TURN_RATE`** (záporně doleva,
kladně doprava). Klávesa i prst posílají plnou jedničku, náklon telefonu tolik,
kolik odpovídá jeho sklonu; držené tlačítko má přednost před čidlem.

Tři vstupy, jedna cesta:

- **Klávesnice** – `input.js` mapuje `keydown` i `keyup`.
- **Dotyk a myš** (`Game.bindPointer`) – horní pruh jsou přepínače (jejich
  pořadí drží `Game.toggles()`, takže ikona sedí do pruhu, do kterého se ťuká),
  zbytek plochy je rozdělený na tři svislé pásy: krajních 30 % zatáčí,
  prostředek zastaví. Obojí se drží. Držení se hlídá po jednotlivých prstech,
  takže puštění jednoho prstu nezruší zatáčení druhým.
- **Náklon telefonu** (`js/tilt.js`) – náklon doleva a doprava stáčí labyrint,
  a to **úměrně tomu, jak moc je telefon nakloněný**: do `DEAD_ZONE` (10°) nic,
  pak lineárně nahoru až po `FULL_TILT` (90°, tedy telefon na boku), kde se
  otáčí nejrychleji (`TURN_MAX`); výš už se nezrychluje. Rozsah je schválně
  široký – při běžném naklonění o pár desítek stupňů se labyrint stáčí pomalu
  a dá se s ním mířit, prudké otočení je pak vědomé gesto. Tři věci, bez kterých by to nefungovalo:
  čidlo se pozná až podle první události (na desktopu `DeviceOrientationEvent`
  existuje, ale nikdy nic nepošle), iOS chce povolení a dá ho **jen z dotyku**
  (proto o něj žádá až přepínač), a **klidová poloha se měří při zapnutí** –
  nikdo nedrží telefon rovně. Osy čidla jsou v soustavě přístroje, takže se musí
  otočit podle `screen.orientation.angle`, jinak by se na ležato zatáčelo
  nakláněním od sebe. Ověřuje to `node tools/tilttest.mjs` s emulovaným čidlem –
  na počítači se náklon jinak vyzkoušet nedá.

Do horního pruhu se na telefonu všechno nevejde, takže `drawHud` texty **měří
a zkracuje po stupních**: nejdřív zmizí počet pokusů, pak stav sýra. Jakmile je
sýr posbíraný, počítat už není co a na jeho místě svítí zlatě „VÝCHOD OTEVŘEN“.
Pruh postupu počítá sýr i vzdálenost k východu (`Game.measureProgress`) – bez
sýra by ukazoval plno i před zavřenými vrátky.

## Pohybový model

**Myš běží pořád rovně před sebe** (`js/entities/mouse.js`) a hráč jí jen otáčí.
Poloha je spojitá, ne po buňkách: `x`, `y` a `heading`. Není v tom žádné
automatické zatáčení ani přichytávání k ose chodby – to, kam myš míří, je
výhradně součet toho, co hráč nadržel.

- **Do zdi se myš zapře a běží na místě** (`stalled`). Náraz nezabíjí; je to
  normální stav a hlásí ho zvuk i vibrace.
- **Šikmý dotyk stěnu obklouzne.** Osy se v `#run` řeší zvlášť, takže myš
  mířící šikmo do stěny sklouzne podél ní a zastaví se až tam, kde je zeď
  opravdu proti ní. Bez toho by se hráč musel trefovat do osy chodby na
  desetiny stupně; s tím stačí držet směr zhruba.
- **Otáčení jde i na místě**, takže se ve slepé uličce dá v klidu otočit
  o 180° – zastavená myš se otáčí stejně rychle jako běžící.
- **Brzda je jediný způsob, jak počkat.** `Mouse.brake` stáhne rozjezd
  (`pace`) k nule a zase zpátky rychlostí `PACE_RATE`; drží se stejně jako
  zatáčení. Bez ní by se před cyklickou pastí nedalo zastavit: otočit se do zdi
  trvá skoro vteřinu a v tu chvíli už je myš v pasti.
- Poloměr tělíčka pro kolize je `MOUSE_RADIUS` (menší než půl buňky, takže
  v jednopolíčkové chodbě zbývá vůle na obě strany).

**Běh je schválně pomalý** (`BASE_SPEED`, rychlost levelů roste jen ze 100 na
120 %). Tohle není hra na rychlost, ale na vyznání se v labyrintu. Kdo chce
přitvrdit, ať přidá na spletitosti mapy (`MIN_RUN`, míň smyček), ne na rychlosti.

Kočka se pohybuje jinak: po mřížce, se zatáčkami po oblouku
(`js/entities/runner.js`). Hlídkovat po chodbách je přesně to, co dělá, a nikdo
jí do řízení nemluví – volný pohyb by jí byl k ničemu.

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
- **Sýr je povinný**: dokud v mapě nějaký leží, jsou vrátka ve východu zavřená
  a myš se o ně zapře jako o zeď. Kolik ho v levelu je, je tím pádem hlavní
  míra toho, jak dlouho level trvá – každý kousek navíc je zajížďka přes půl
  labyrintu a po smrti se sbírá znovu od začátku.
- místo čísla jde předat `{speed, theme}`; jméno tématu si `Game` vymění za
  třídu prostředí (`js/themes/`), takže **kresba i hudba světa jsou v jednom
  souboru**. `'cellar'` je sklep (cihly, hlína, prach ve vzduchu), `'kitchen'`
  kuchyň (kachlíky, drobky, linoleum), `'sewer'` kanál (beton, voda, kapky).
  Bez tématu jsou to kamenné katakomby.
- **Světy se střídají, nejdou po blocích** – hráč tak vidí všechna prostředí od
  začátku. Bez tématu zůstávají levely 1, 5 a 9; i „žádné téma“ je prostředí
  a taky se střídá.

Mimo mapu je zeď: labyrint je uzavřený a ven vede jen `F` – a to až
s posledním sýrem. Level končí proběhnutím otevřenými vrátky.

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
- **Sýr nesmí ležet tam, odkud se nedá vycouvat.** Je povinný, takže ho nesmí
  odříznout pila (generátor ho klade jen tam, kam se dá dojít, i když jsou
  všechny dráhy pil zazděné) a v levelu s kočkou nesmí ležet v kapse s jediným
  hrdlem (`in_pocket`): kočka, která do takové chodby vejde za myší, je jistá
  smrt, a to není hádanka, ale los. Když se všechen plánovaný sýr nevejde, je
  celý pokus k zahození – tiše ubrat se nesmí.
- **Cesta k východu musí být aspoň `MIN_RUN`× delší než strana labyrintu**,
  jinak by hráč vyběhl ven dřív, než by zjistil, kudy běží. Je to hlavní páka
  na obtížnost: labyrint má být spletitý, ne rychlý.
- **Smyček (`loops`) jen pár.** Každá probouraná zeď dělá z labyrintu mřížku,
  ve které se nedá zabloudit; bez jediné by zase nebylo před kočkou kam uhnout.
  Ve výchozím plánu jich je zhruba desetina strany labyrintu.

Ověřuje se **celá cesta včetně sýra** (`find_route`): vrátka otevírá poslední
kousek, takže se od doupěte skládá úsek po úseku (vždycky k nejbližšímu sýru,
nakonec k východu) a každý další úsek začíná v čase, kdy ten předchozí skončil –
pasti běží podle hodin, ne podle myši. Nejkratší pořadí to není a být nemusí:
stačí, že se to takhle dá odjet.

Jeden úsek (`find_path`) hledá posloupnost přeběhů **po vrstvách času**: přeběh
mezi sousedními buňkami trvá vždycky stejně, takže je čas ve vrstvě přesně daný.
Když level neprojde, skript skončí chybou a nic nezapíše.

Od volného pohybu je tenhle model jen **přibližný, ale na správnou stranu**:
myš po mřížce nejede, takže je ve skutečnosti pomalejší (otáčení a klouzání po
zdi něco stojí), zato umí zastavit a počkat, což mřížkový model neumí. Cesta,
kterou generátor najde, se tedy dá odjet i pozdějším cyklem pasti – pasti se
opakují. Poslední slovo má stejně `playtest.mjs`, který hraje opravdovou hru.

**Kočky se neověřují**: reagují na hráče, takže by výsledek stejně neplatil.
Férové je to i bez toho, protože kočka je pomalejší a myš ji uvidí dřív.

Ručně upravenou mapu generátor **nepřepíše**: v hlavičce každého souboru je
otisk mapy a když nesedí na obsah, soubor se přeskočí (`--force` to vynutí).
Takový level pak neodpovídá plánu – ověřuj ho přes
`python3 tools/gen_mazes.py --verify js/levels/levelX.js`.

`tools/playtest.mjs` totéž ověří proti opravdovému kódu hry: pustí hru
v Chromiu a **odehraje ji autopilotem** – ten drží myš namířenou na buňku, která
je nejblíž k cíli (dokud leží sýr, je cílem nejbližší sýr, pak teprve východ),
před zavřenou pastí zastaví a počká (stejnou brzdou jako hráč), pile a kočce
uhne a chodbu, kudy to nejde, si odepíše a spočítá cestu jinudy. Kočku pozná
**v celé chodbě před sebou, i za ohybem** (`catAhead`): v jednopolíčkové chodbě
se kolem ní neprotáhne a otočka trvá skoro vteřinu, takže couvnout se musí dřív,
než si stojí čumák proti čumáku. Rozpočet času platí **na jeden pokus**, protože
po smrti se sbírá znovu od začátku. Kam mířit, se drží zlomek vteřiny, ale **jestli se smí jet, se počítá
každý snímek**: past je otevřená sotva vteřinu a půl a na zastaralé rozhodnutí
se ta chvíle prošvihne. Nekouká
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
- Otevření vrátek má vlastní zvuk i vibraci (`gate`). Hráč je v tu chvíli
  většinou na druhém konci labyrintu, takže se to jinak nedozví – a je to
  největší okamžik pokusu.
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
