// Comparação de placa e marca entre a notificação e o CRLV.

export function normalizePlate(p: string): string {
  return p.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Converte placa no padrão antigo (AAA9999) para o padrão Mercosul (AAA9A99). */
export function toMercosul(plate: string): string {
  const p = normalizePlate(plate);
  if (/^[A-Z]{3}\d{4}$/.test(p)) {
    const letter = String.fromCharCode(65 + Number(p[4]));
    return p.slice(0, 4) + letter + p.slice(5);
  }
  return p;
}

export function samePlate(a: string, b: string): boolean {
  return toMercosul(a) === toMercosul(b);
}

function strip(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
}

const BRAND_ALIASES: Record<string, string> = {
  VW: "VOLKSWAGEN",
  VOLKS: "VOLKSWAGEN",
  GM: "CHEVROLET",
  CHEV: "CHEVROLET",
  MB: "MERCEDES",
  "MERCEDES-BENZ": "MERCEDES",
  MERCEDESBENZ: "MERCEDES",
  "M.BENZ": "MERCEDES",
  MMC: "MITSUBISHI",
  LR: "LANDROVER",
  "LAND ROVER": "LANDROVER",
  CITROEN: "CITROEN",
  HYUNDAI: "HYUNDAI",
  HONDA: "HONDA",
  FIAT: "FIAT",
  FORD: "FORD",
  RENAULT: "RENAULT",
  TOYOTA: "TOYOTA",
  NISSAN: "NISSAN",
  PEUGEOT: "PEUGEOT",
  JEEP: "JEEP",
  KIA: "KIA",
  YAMAHA: "YAMAHA",
};

export interface BrandModel {
  marca: string | null;
  modelo: string[];
}

export function parseBrandModel(s: string): BrandModel {
  const t = strip(s).trim();
  if (!t) return { marca: null, modelo: [] };
  const [rawBrand, ...rest] = t.includes("/") ? t.split("/") : t.split(/\s+/);
  const brandKey = (rawBrand ?? "").trim();
  const marca = BRAND_ALIASES[brandKey] ?? BRAND_ALIASES[brandKey.replace(/\s+/g, "")] ?? brandKey.replace(/\s+/g, "");
  const modelo = rest.join(" ").split(/[\s.\-]+/).filter((w) => w.length >= 2);
  return { marca: marca || null, modelo };
}

export interface VehicleComparison {
  placa: "igual" | "diferente" | "sem_dados";
  marca: "igual" | "diferente" | "sem_dados";
  modelo: "igual" | "diferente" | "sem_dados";
}

export function compareVehicle(notif: { placa: string | null; marca_modelo: string | null }, crlv: { placa: string | null; marca_modelo: string | null }): VehicleComparison {
  const placa = notif.placa && crlv.placa ? (samePlate(notif.placa, crlv.placa) ? "igual" : "diferente") : "sem_dados";
  let marca: VehicleComparison["marca"] = "sem_dados";
  let modelo: VehicleComparison["modelo"] = "sem_dados";
  if (notif.marca_modelo && crlv.marca_modelo) {
    const a = parseBrandModel(notif.marca_modelo);
    const b = parseBrandModel(crlv.marca_modelo);
    if (a.marca && b.marca) marca = a.marca === b.marca ? "igual" : "diferente";
    if (a.modelo.length && b.modelo.length) modelo = a.modelo.some((w) => b.modelo.includes(w)) ? "igual" : "diferente";
  }
  return { placa, marca, modelo };
}
