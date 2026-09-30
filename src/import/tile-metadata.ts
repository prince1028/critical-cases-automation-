import type { CodeType } from './tile-references';

/**
 * Tile facts stated in the WhatsApp chat or printed on a photographed label. Nothing here is inferred:
 * a field is only filled when the source says it. Keyed by canonical tile_code.
 * Used to seed the tile master on first import; existing tiles are never overwritten.
 */
export interface TileFacts {
  codeType?: CodeType;
  name?: string;
  brand?: string;
  supplier?: string;
  supplierCode?: string;
  source: string;
}

export const TILE_FACTS: Record<string, TileFacts> = {
  // Florzy IDs (florzy.com/p/<id> labels, sales-app product IDs or "Florzy code" in chat)
  '1411': { codeType: 'FLORZY_ID', name: 'Green Glossy Punch Ceramic Subway Tile (Picket 404)', source: 'M1358 "Florzy code - 1411"; app screenshot 00004378' },
  '1991': { codeType: 'FLORZY_ID', name: 'Beige Matt Carving Onyx Vitrified 1200x1800mm', source: 'sales-app cart 00004195' },
  '3114': { codeType: 'FLORZY_ID', name: 'Cream Matt Glue Porcelain Stone Look Tile', supplier: 'Sultania Ceramics', supplierCode: 'CV.SOLID CREMA (2X2) METRO (MATT)', source: 'M1021; label 00004044' },
  '3361': { codeType: 'FLORZY_ID', name: 'Brown Matt Punch Vitrified Stone Look Tile', source: 'label 00003615' },
  '6247': { codeType: 'FLORZY_ID', name: 'Grey Matt Punch Vitrified Stone Look Tile', source: 'label 00003763' },
  '6716': { codeType: 'FLORZY_ID', supplier: 'Maa Janki Ceramics', supplierCode: 'NS 9675 HL 4', source: 'M1529; label 00004550' },
  '7269': { codeType: 'FLORZY_ID', name: 'Pink Matt Ceramic Subway Tile', source: 'label 00004536' },
  '7270': { codeType: 'FLORZY_ID', name: 'Pink Glossy Ceramic Subway Tile', source: 'label 00004536' },
  '7594': { codeType: 'FLORZY_ID', name: 'Brown Rustic Matt Vitrified Moroccan Tile', source: 'app 00004019; label 00004021' },
  '7693': { codeType: 'FLORZY_ID', name: 'Cream Glossy Vitrified Endmatch Tile', source: 'label 00004399' },
  '8289': { codeType: 'FLORZY_ID', name: 'Marcel Lenox (Beige Glossy Punch Ceramic Subway Tile)', supplier: 'VH', source: 'M1541; label 00004577' },
  '8339': { codeType: 'FLORZY_ID', name: 'Cream Subway Ceramic 300x600mm Wall Tile', source: 'app cart 00004430' },
  '8505': { codeType: 'FLORZY_ID', name: 'Cream Glossy Vitrified Endmatch Tile', source: 'label 00004501' },
  '8602': { codeType: 'FLORZY_ID', name: 'Grey Matt Carving Vitrified Wooden Tile', source: 'label 00004011' },
  '8605': { codeType: 'FLORZY_ID', name: 'Brown Matt Punch Vitrified Wooden Tile', source: 'label 00004012' },
  '9144': { codeType: 'FLORZY_ID', name: 'Cream Rustic Matt Vitrified Concrete Tile', supplier: 'CC', source: 'M1546; label 00004581' },
  '9248': { codeType: 'FLORZY_ID', supplier: 'Livon Ceramics', source: 'M1396 "Florzy codes - 9248 & 9249 - Livon ceramics"' },
  '9249': { codeType: 'FLORZY_ID', name: 'Beige Onyx Vitrified 600x1200mm', supplier: 'Livon Ceramics', source: 'M1396; app cart 00004419' },
  '9879': { codeType: 'FLORZY_ID', name: 'Brown Textured Matt Third Fire Vitrified Carpet Tile (corner)', supplier: 'Ceramic Fashion Studio', supplierCode: 'CFDC1515023', source: 'M1015; label 00004041' },
  '9902': { codeType: 'FLORZY_ID', name: 'Brown Textured Matt Third Fire Vitrified Carpet Tile (border)', supplier: 'Ceramic Fashion Studio', supplierCode: 'CFDB 3015023', source: 'M1015; label 00004043' },
  '9926': { codeType: 'FLORZY_ID', name: 'Brown Textured Matt Third Fire Vitrified Carpet Tile (base)', supplier: 'Ceramic Fashion Studio', supplierCode: 'CFDM 3030023', source: 'M1015; label 00004042' },
  '11366': { codeType: 'FLORZY_ID', name: 'Beige Satin Matt Colour Body Vitrified Marble Tile', source: 'label 00004500' },
  '11470': { codeType: 'FLORZY_ID', name: 'Slate Silver Grey (Silver Rustic Matt Full Body Vitrified Slate Tile)', source: 'label 00004259' },
  '11604': { codeType: 'FLORZY_ID', name: 'Haritage Tallado Decor (La Italia, Quadrato)', source: 'label 00004249' },
  '11691': { codeType: 'FLORZY_ID', name: 'Vesubio Rice Endless', supplier: 'Nandi Ceramic', source: 'M1553 + M1559 "f code: 11691"' },

  // Vendor / manufacturer codes quoted as the SKU in chat
  '724': { codeType: 'VENDOR_CODE', supplier: 'MJC', source: 'M0272 "Sku=724 Vendor=mjc"' },
  '3015': { codeType: 'VENDOR_CODE', supplier: 'NC', source: 'M0274 "Sku=3015 Vendor=nc"' },
  '12811': { codeType: 'VENDOR_CODE', supplier: 'Alisa Ceramics', source: 'M0618' },
  '8072': { codeType: 'VENDOR_CODE', supplier: 'QBO Marketing', source: 'M0969' },
  '3978': { codeType: 'VENDOR_CODE', name: 'Ord.Dig 12x24 Glue-Emerald', brand: 'Orinda', supplier: 'Sultania Ceramics', source: 'M0915' },
  '3013-EL': { codeType: 'VENDOR_CODE', supplier: 'SC', source: 'M0538' },
  '2911': { codeType: 'VENDOR_CODE', source: 'sticker on showroom panel 00004574' },
  '5006': { codeType: 'VENDOR_CODE', name: 'Lippan Art 5006', source: 'caption on 00004051' },
  'OMEGA-7008': { codeType: 'VENDOR_CODE', name: 'Omega 7008', supplier: 'Nandi Ceramics', source: 'M0051 "Sku=Omega 7008 Vendor=Nc"' },
  'SA-1268': { codeType: 'VENDOR_CODE', name: 'Lorient Gris - Glorious', supplier: 'Arihant Sales', source: 'M1314; display 00004353' },
  'RKPHIG-041906': { codeType: 'VENDOR_CODE', name: 'Travertine Crema [Soft Naturale]', brand: 'Nexion', source: 'M1110' },
  'RKPHIG-034525': { codeType: 'VENDOR_CODE', name: 'Endless Grigio', brand: 'Nexion', source: 'M1110' },
  'MAND-MD-01-SP': { codeType: 'VENDOR_CODE', name: 'Bianco Armor', brand: 'Mirage', source: 'spec sheet 00003840' },
  'PIXEL-904': { name: 'Pixel 904', source: 'M0251 "Pixel 904"; board 00003258' },
  '1516': { name: 'IWIN 2x2', supplier: 'Alisa Ceramics', source: 'M0896 "1516 (2x2) IWIN, Alisa"' },
};
