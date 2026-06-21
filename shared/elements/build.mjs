// build.mjs — regenerate elements.json from canonical element data + the layout rules below.
//   node shared/elements/build.mjs
// Symbol and name come from the canonical SYMBOLS/NAMES tables (NOT from filenames — a card
// file was once misnamed, e.g. Z16 sulfur as "...16_P.png", which silently corrupted the
// data). The image path is built from the canonical symbol and the file is asserted to exist.
import { existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));

const NAMES = {
  1:"Hydrogen",2:"Helium",3:"Lithium",4:"Beryllium",5:"Boron",6:"Carbon",7:"Nitrogen",
  8:"Oxygen",9:"Fluorine",10:"Neon",11:"Sodium",12:"Magnesium",13:"Aluminium",14:"Silicon",
  15:"Phosphorus",16:"Sulfur",17:"Chlorine",18:"Argon",19:"Potassium",20:"Calcium",21:"Scandium",
  22:"Titanium",23:"Vanadium",24:"Chromium",25:"Manganese",26:"Iron",27:"Cobalt",28:"Nickel",
  29:"Copper",30:"Zinc",31:"Gallium",32:"Germanium",33:"Arsenic",34:"Selenium",35:"Bromine",
  36:"Krypton",37:"Rubidium",38:"Strontium",39:"Yttrium",40:"Zirconium",41:"Niobium",42:"Molybdenum",
  43:"Technetium",44:"Ruthenium",45:"Rhodium",46:"Palladium",47:"Silver",48:"Cadmium",49:"Indium",
  50:"Tin",51:"Antimony",52:"Tellurium",53:"Iodine",54:"Xenon",55:"Cesium",56:"Barium",57:"Lanthanum",
  58:"Cerium",59:"Praseodymium",60:"Neodymium",61:"Promethium",62:"Samarium",63:"Europium",
  64:"Gadolinium",65:"Terbium",66:"Dysprosium",67:"Holmium",68:"Erbium",69:"Thulium",70:"Ytterbium",
  71:"Lutetium",72:"Hafnium",73:"Tantalum",74:"Tungsten",75:"Rhenium",76:"Osmium",77:"Iridium",
  78:"Platinum",79:"Gold",80:"Mercury",81:"Thallium",82:"Lead",83:"Bismuth",84:"Polonium",
  85:"Astatine",86:"Radon",87:"Francium",88:"Radium",89:"Actinium",90:"Thorium",91:"Protactinium",
  92:"Uranium",93:"Neptunium",94:"Plutonium",95:"Americium",96:"Curium",97:"Berkelium",
  98:"Californium",99:"Einsteinium",100:"Fermium",101:"Mendelevium",102:"Nobelium",103:"Lawrencium",
  104:"Rutherfordium",105:"Dubnium",106:"Seaborgium",107:"Bohrium",108:"Hassium",109:"Meitnerium",
  110:"Darmstadtium",111:"Roentgenium",112:"Copernicium",113:"Nihonium",114:"Flerovium",
  115:"Moscovium",116:"Livermorium",117:"Tennessine",118:"Oganesson",
};

// Canonical IUPAC symbols (index = atomic number). Source of truth for the symbol and the
// image filename — never trust the on-disk filename, which can be wrong.
const SYMBOLS = [
  "", "H","He","Li","Be","B","C","N","O","F","Ne","Na","Mg","Al","Si","P","S","Cl","Ar","K","Ca",
  "Sc","Ti","V","Cr","Mn","Fe","Co","Ni","Cu","Zn","Ga","Ge","As","Se","Br","Kr","Rb","Sr","Y","Zr",
  "Nb","Mo","Tc","Ru","Rh","Pd","Ag","Cd","In","Sn","Sb","Te","I","Xe","Cs","Ba","La","Ce","Pr","Nd",
  "Pm","Sm","Eu","Gd","Tb","Dy","Ho","Er","Tm","Yb","Lu","Hf","Ta","W","Re","Os","Ir","Pt","Au","Hg",
  "Tl","Pb","Bi","Po","At","Rn","Fr","Ra","Ac","Th","Pa","U","Np","Pu","Am","Cm","Bk","Cf","Es","Fm",
  "Md","No","Lr","Rf","Db","Sg","Bh","Hs","Mt","Ds","Rg","Cn","Nh","Fl","Mc","Lv","Ts","Og",
];

// Visual periodic-table coordinates (1-indexed). Main block rows 1-7; the detached
// f-block strips render as rows 9 (lanthanides) and 10 (actinides). group=0 marks f-block.
function layout(z) {
  if (z === 1)  return { period: 1, group: 1,  col: 1,  row: 1 };
  if (z === 2)  return { period: 1, group: 18, col: 18, row: 1 };
  if (z >= 3  && z <= 10) { const i = z - 3;  const c = i < 2 ? i + 1 : i + 11; return { period: 2, group: c, col: c, row: 2 }; }
  if (z >= 11 && z <= 18) { const i = z - 11; const c = i < 2 ? i + 1 : i + 11; return { period: 3, group: c, col: c, row: 3 }; }
  if (z >= 19 && z <= 36) return { period: 4, group: z - 18, col: z - 18, row: 4 };
  if (z >= 37 && z <= 54) return { period: 5, group: z - 36, col: z - 36, row: 5 };
  if (z === 55) return { period: 6, group: 1, col: 1, row: 6 };
  if (z === 56) return { period: 6, group: 2, col: 2, row: 6 };
  if (z >= 57 && z <= 71)  return { period: 6, group: 0, col: 3 + (z - 57), row: 9,  fblock: true };
  if (z >= 72 && z <= 86)  { const c = (z - 72) + 4; return { period: 6, group: c, col: c, row: 6 }; }
  if (z === 87) return { period: 7, group: 1, col: 1, row: 7 };
  if (z === 88) return { period: 7, group: 2, col: 2, row: 7 };
  if (z >= 89 && z <= 103) return { period: 7, group: 0, col: 3 + (z - 89), row: 10, fblock: true };
  if (z >= 104 && z <= 118){ const c = (z - 104) + 4; return { period: 7, group: c, col: c, row: 7 }; }
  throw new Error(`no layout for Z=${z}`);
}

function blockOf(L, z) {
  if (L.fblock) return "f";
  if (z === 2) return "s";              // He sits at group 18 but is s-block
  if (L.col <= 2) return "s";
  if (L.col >= 3 && L.col <= 12) return "d";
  return "p";
}

// Coarse category, enough to colour-code slots and group cards.
function categoryOf(L, z, block) {
  if (z === 1) return "nonmetal";
  if (L.group === 18) return "noble-gas";
  if (block === "f") return L.period === 6 ? "lanthanide" : "actinide";
  if (block === "d") return "transition-metal";
  if (L.col === 1) return "alkali-metal";
  if (L.col === 2) return "alkaline-earth-metal";
  return "p-block"; // metalloids / post-transition / nonmetals / halogens — kept coarse
}

const elements = [];
for (let z = 1; z <= 118; z++) {
  const symbol = SYMBOLS[z];
  const file = `atlas_game_${z}_${symbol}.png`;
  if (!existsSync(join(HERE, "img", file))) throw new Error(`missing card art: img/${file} (Z=${z} ${NAMES[z]})`);
  const L = layout(z);
  const block = blockOf(L, z);
  elements.push({
    z,
    symbol,
    name: NAMES[z],
    period: L.period,
    group: L.group,        // 1-18, or 0 for the f-block strips
    col: L.col,            // visual column 1-18
    row: L.row,            // visual row 1-7 (main), 9 (lanthanides), 10 (actinides)
    block,                 // s | p | d | f
    category: categoryOf(L, z, block),
    img: `img/${file}`,
  });
}

writeFileSync(join(HERE, "elements.json"), JSON.stringify(elements, null, 0) + "\n");
console.log(`wrote elements.json — ${elements.length} elements`);
