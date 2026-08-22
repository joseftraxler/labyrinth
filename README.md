# Labyrint

Bílá myš utíká ze středu labyrintu ven – ale ne dřív, než posbírá všechen sýr:
teprve poslední kousek otevře vrátka do myšího ráje. Běží sama, ty jí říkáš jen
kudy – a labyrint se pod ní otáčí, protože myš míří vždycky vzhůru.

![Náhled hry](docs/preview.png)

Celá hra je jeden soubor `index.html`, jedno `<canvas>` a pár ES modulů.
Žádný framework, žádné závislosti, žádný build krok – stačí ji hostovat jako
statické soubory. Jde nainstalovat na plochu telefonu a hrát offline.

## Jak se to hraje

Myš vyběhne z doupěte uprostřed labyrintu a sbírá po chodbách sýr. Vidí přitom
jen kousek okolo sebe – co je za rohem, zjistí, až tam doběhne. **Dokud v mapě
zbývá jediný kousek sýra, jsou vrátka ve východu zavřená** a myš se o ně zapře
jako o zeď; posledním sýrem cvaknou, otevřou se dokořán a za nimi je vidět
louka se sýrovými koly. Tam se běží.

Běží se pomalu a rozvážně: tohle není hra na rychlost, ale na to vyznat se
v labyrintu. Pomáhá **plánek v pravém horním rohu** – ukazuje celý labyrint,
zeleně to, kudy už jsi prošla, kde je východ (zavřený jen obrysem), kde zůstal
ležet sýr, na který jsi cestou narazila, a kterým směrem myš zrovna míří.
Na plánku je sever nahoře, i když se labyrint pod myší otáčí.

| Co chceš | Klávesnice | Dotyk a myš | Náklon |
| --- | --- | --- | --- |
| stáčet doleva | držet `←` / `A` | držet levý kraj obrazovky | naklonit telefon doleva |
| stáčet doprava | držet `→` / `D` | držet pravý kraj obrazovky | naklonit telefon doprava |
| zastavit a počkat | držet `mezerník` / `↓` / `S` | držet střed obrazovky | – |
| pauza | `Esc` / `P` | horní pruh | – |
| zkusit znovu | `R` | – | – |
| zvuk / vibrace / náklon | `M` / `H` / `T` | ikony v pravém rohu | – |

**Myš běží pořád rovně před sebe a ty otáčíš celý labyrint.** Dokud držíš šipku,
kraj obrazovky nebo naklopený telefon, svět se pod myší pozvolna stáčí – nikdy
to nikam neskočí o 90°. Když má myš proti sobě zeď, běží na místě, takže se ve
slepé uličce dá v klidu otočit o 180°.

Před cyklickou pastí se **zastavuje**: prostředek obrazovky (nebo mezerník) myš
zabrzdí a nechá ji čichat na místě, dokud se past neotevře.

Ovládání nakláněním se zapíná ikonou telefonu v pravém rohu (na iPhonu si při
tom řekne o přístup k čidlu). Hra si při zapnutí zapamatuje, jak telefon zrovna
držíš, a pak **reaguje na to, jak moc ho nakloníš**:

| Náklon | Co dělá |
| --- | --- |
| do 10° | nic – chvění ruky labyrintem neotáčí |
| 20° | zvolna, na doladění směru (asi 35°/s) |
| 45° | svižně (asi 120°/s) |
| 90° (telefon na boku) | nejrychleji (275°/s) |
| víc | pořád stejně – rychleji už ne, aby šlo udržet orientaci |

Mezi deseti a devadesáti stupni rychlost roste rovnoměrně, takže se běžným
nakloněním o pár desítek stupňů dá mířit v klidu a přesně.

Zatáčení je **relativní k myši**: labyrint se otáčí jako mapa v navigaci, takže
„doleva“ znamená doleva pořád, ať už myš běží kamkoliv. Zeď myš nezabije, jen se
o ni zapře – a otočka na místě je zároveň jediný způsob, jak před pastí počkat
na správnou chvíli.

## Co v labyrintu číhá

- **Sklapovačky** cvakají podle hodin, ne podle myši. Než sklapnou, pružina se
  chvěje – dá se to přečíst a proběhnout mezi tím.
- **Propadla** v podlaze se cyklicky otevírají. Před otevřením víko vrže.
- **Pily** jezdí sem a tam po krátkém úseku chodby. Kolem každé vede i jiná
  cesta, takže se dají obejít – nebo přeběhnout, když zrovna odjedou.
- **Kočky** hlídkují labyrintem a co uvidí rovnou chodbou, to honí. Jsou
  pomalejší než myš a vidí kratší kus chodby, takže se jim dá utéct – ale
  ne do slepé uličky. Povinný sýr proto v koutě s jedinou cestou ven nikdy
  neleží: kočka za zády tam je jistá smrt, a to už by nebyla hádanka.

## Světy

Deset labyrintů, čtyři prostředí, a každé má vlastní vzhled i hudbu. Střídají se
od začátku, takže žádná část hry nevypadá dlouho stejně.

| | |
| --- | --- |
| ![Sklep](docs/cellar.png) | ![Kuchyň](docs/kitchen.png) |
| **Sklep** – cihly, udusaná hlína a prach ve vzduchu | **Kuchyň** – kachlíky, drobky a nejvíc sklapovaček |
| ![Kanál](docs/sewer.png) | ![Katakomby](docs/preview.png) |
| **Kanál** – beton, voda u stěn a kapky ze stropu | **Katakomby** – kámen a tma, se kterou hra začíná |

## Spuštění

ES moduly se přes `file://` nenačtou, takže je potřeba statický server:

```bash
python3 -m http.server 8000   # a pak http://localhost:8000
```

Nebo přes Docker:

```bash
docker compose up
```

## Jak vznikají labyrinty

Mapy negeneruje náhoda, ale `tools/gen_mazes.py`: vyhloubí labyrint, probourá
pár zdí navíc (aby vedla víc než jedna cesta), prorazí východ co nejdál od
doupěte, rozmístí nástrahy se sýrem – a pak **simulací ověří, že se level dá
projít**. Když neprojde, nic se nezapíše.

```bash
python3 tools/gen_mazes.py           # přegeneruje js/levels/*.js
python3 tools/gen_mazes.py --check   # jen ověří, nic nezapíše
node tools/playtest.mjs              # projde všech 10 levelů v Chromiu
node tools/tilttest.mjs              # ovládání nakláněním s emulovaným čidlem
```

Ověřuje se přitom celá cesta včetně sýra – bez posledního kousku se vrátka
neotevřou, takže „průchodný“ znamená „dá se posbírat všechno a doběhnout ven“.

Playtest hru opravdu hraje: pustí ji v prohlížeči a odehraje autopilotem, který
si to namíří na nejbližší sýr, pak k východu, před zavřenou pastí počká a pile
s kočkou uhne. Je to zároveň kontrola, že si kód hry a simulace v generátoru
odpovídají.

## Licence

MIT – viz [LICENSE](LICENSE).
