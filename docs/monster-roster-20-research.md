# Twenty-monster research roster

## Scope

This pass expands the shipped catalog from **84 monsters / 26 body shapes** to
**104 monsters / 46 body shapes**. Each new monster owns a new procedural shape
builder; none is a palette-only reuse of an older silhouette.

The designs translate visible biological or folkloric cues into the existing
combat vocabulary (`swarm`, `skirmish`, `charge`, `tank`, `ranged`, `caster`)
so Hunt and Defense can use them without adding a parallel AI system.

## Roster and translation

| Zone | Monster / shape | Reference cue | Runtime translation |
|------|-----------------|---------------|---------------------|
| Verdant | Snapjaw Bloom / `flytrap` | Two hinged trap leaves and interlocking teeth | Fast charge rusher with a wide jaw silhouette |
| Verdant | Nectar Urn / `pitcher` | Deep pitfall urn, slippery rim, protective hood | Slow-bolt controller with a tall open vessel silhouette |
| Verdant | Grove Pangolin / `pangolin` | Overlapping armor scales, pointed snout, protective curl | Slow frontline tank with an armor aura |
| Forest | Razor Mantis / `mantis` | Triangular head and spined raptorial forelegs | Long-limbed ambush charger |
| Forest | Lantern Moth / `moth` | Broad scaled wings, eyespots, feathered antennae | Wide flying controller that fires slowing bolts |
| Forest | Root Centipede / `centipede` | Flattened segments, one leg pair per segment, venom claws | Low, long swarm profile |
| Canyon | Thornback Devil / `thornback` | Conical armor and false head on the neck | Defensive frontline lizard |
| Canyon | Dune Fennec / `fennec` | Very large heat-radiating ears and light desert frame | Fast in-and-out skirmisher |
| Canyon | Blasttail Beetle / `bombardier` | Swollen chemical abdomen and directional rear spray | Rear-nozzle artillery silhouette |
| Frost | Rime Muskox / `muskox` | Barrel body, long insulating coat, helmet-like horn boss | Heavy charging frontline body |
| Frost | Snowtail Leopard / `snow_leopard` | Wide snow paws, rosettes, body-length balancing tail | Fast pack hunter |
| Frost | Glacier Walrus / `walrus` | Massive body, sensory whiskers, flippers, tusks | Slow high-defense frontline body |
| Ember | Cinder Salamander / `salamander` | Low amphibian body and tail-driven locomotion | Long, low charge predator with flame crest |
| Ember | Furnace Ant / `fire_ant` | Three body sections, colony behavior, powerful mandibles | Small high-frequency swarm unit |
| Ember | Slagfoot Snail / `slag_snail` | Iron-sulfide shell coating and metal-plated foot scales | Very slow armor-aura tank |
| Ember | Pyre Phoenix / `phoenix` | Eagle-like red/gold bird associated with fire and renewal | Large-winged aerial artillery silhouette |
| Astral | Lurestar Angler / `angler` | Gaping suction mouth and glowing modified fin-ray lure | Lure-bearing slow-bolt controller |
| Astral | Veil Vampire Squid / `vampire_squid` | Cloak-like arm web, large eyes, photophores | Webbed ranged attacker |
| Astral | Chainlight Colony / `siphonophore` | A colony of specialized zooids arranged as one animal | Tall linked support caster with armor aura |
| Astral | Void Nautilus / `nautilus` | Chambered external shell and a crown of many arms | Floating shell tank with armor aura |

## Research sources

- [Kew Gardens: carnivorous plants](https://www.kew.org/read-and-watch/carnivorous-plants) — snap traps, pitcher pitfalls, sticky and suction traps.
- [San Diego Zoo: tree pangolin](https://animals.sandiegozoo.org/animals/tree-pangolin) — overlapping keratin armor, pointed face, long tail, defensive curl.
- [Praying mantis morphology (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC5673847/) — spined raptorial foreleg structure.
- [Smithsonian: moths](https://www.si.edu/spotlight/buginfo/moths) — scaled broad wings, feathery antennae, eyespot and tail variation.
- [National Park Service: centipedes](https://www.nps.gov/kaww/learn/nature/insects.htm) — segmented body, outward leg pairs, venom claws.
- [Australian Museum: thorny devil](https://australian.museum/visit/audio-tours/wild-planet-audio-description/tour_stop/4/) — conical spines, ochre body, false head.
- [San Diego Zoo: fennec fox](https://animals.sandiegozoo.org/animals/fennec-fox) — oversized ears, sandy coat, furred feet.
- [Natural History Museum: bombardier beetle](https://www.nhm.ac.uk/discover/bombardier-beetles-and-their-caustic-chemical-cannon.html) — protected reaction chamber and aimed pulsed rear spray.
- [National Park Service: muskox Arctic design](https://www.nps.gov/gaar/learn/nature/muskox-designed-for-the-arctic.htm) — barrel build, short legs, double coat.
- [San Diego Zoo: snow leopard](https://animals.sandiegozoo.org/animals/snow-leopard) — wide furry paws, rosettes, long balancing tail.
- [NOAA Fisheries: pinniped and walrus traits](https://www.fisheries.noaa.gov/feature-story/14-seal-secrets) — tusks, whisker sensing, and flipper body plan.
- [Natural History Museum: salamander-like amphibian motion](https://www.nhm.ac.uk/discover/news/2023/march/fossils-reveal-how-giant-amphibians-swam-shores-ancient-sea.html) — long low outline and tail propulsion.
- [Smithsonian: trap-jaw ant](https://insider.si.edu/2017/08/locked-loaded-unique-trigger-design-fires-ants-snapping-jaws/) — spring-loaded elongated mandibles and colony-scale insect form.
- [Smithsonian Ocean: scaly-foot snail](https://ocean.si.edu/ocean-life/invertebrates/meet-metal-snail-bottom-ocean) — iron-sulfide shell and metal-plated scales at hydrothermal vents.
- [1911 Encyclopaedia Britannica: phoenix](https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/Phoenix) — eagle-like red/gold bird, solar fire, and renewal tradition.
- [Smithsonian Ocean: anglerfish](https://ocean.si.edu/ocean-life/fish/anglerfish-lure-prey-throughout-ocean) — modified glowing fin-ray lure and gape-and-suck mouth.
- [NOAA: deep-sea cephalopod adaptations](https://oceanexplorer.noaa.gov/expedition-feature/19biolum-background-cephalopods/) — vampire squid arm web, photophores, and filaments.
- [Smithsonian Ocean: siphonophores](https://ocean.si.edu/holding-tank/images-hide/siphonophores) — linked specialized zooids and bioluminescent prey attraction.
- [Smithsonian Ocean: cephalopods and nautilus](https://ocean.si.edu/ocean-life/invertebrates/octopuses-squids-and-relatives) — chambered shell, buoyancy, and numerous sticky-grooved arms.

## Verification contract

`tests/monster-roster.mjs` proves that all twenty entries:

- own twenty distinct shape keys;
- use a procedural builder without a GLB fallback;
- produce finite, playable multi-part bounds and unique geometry signatures;
- preserve their shape id through `MonsterFactory`;
- enter the correct generated Hunt/Defense zone pool;
- carry a valid Defense role and at least two researched feature tags.
