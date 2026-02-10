export const SIZE_SORT_ORDER: Record<string, number> = {
    '00': 10,
    '0': 20,
    '1': 30,
    '1,5': 40,
    '2': 50,
    '2,5': 60,
    '3': 70,
    '3,5': 80,
    '4': 90,
    '4,5': 100,
    '5': 110,
    '5,5': 120,
    '6': 130,
    '6,5': 140,
    '7': 150,
    '7,5': 160,
    '8': 170,
    '8,5': 180,
    '9': 190,
    '9,5': 200,
    '10': 210,
    '11': 220,
    '12': 230,
    '13': 240,
    '14': 250,
    '15': 260,
    'ALL': 270,
    'OS': 280,
    '3S': 290,
    '2S': 300,
    'S': 310,
    'SM': 320,
    'M': 330,
    'L': 340,
    'XL': 350,
    '2XL': 360,
    '3XL': 370,
    '4XL': 380,
    '5XL': 390
};

export function getSizeSortOrder(name: string): number {
    // Normalize: uppercase and trim
    const normalized = name.trim().toUpperCase();
    return SIZE_SORT_ORDER[normalized] || 999;
}

export const ITEM_TYPES = {
  RAW_MATERIAL: "RAW_MATERIAL",
  TRADED: "TRADED",
  FINISHED_GOOD: "FINISHED_GOOD",
} as const;

export const TRANSACTION_STATUS = {
  DRAFT: "DRAFT",
  POSTED: "POSTED",
  VOID: "VOID",
} as const;

export const PAYMENT_TERMS = {
  CASH: "CASH",
  CREDIT: "CREDIT",
} as const;

export type ItemType = keyof typeof ITEM_TYPES;
export type TransactionStatus = keyof typeof TRANSACTION_STATUS;
export type PaymentTerm = keyof typeof PAYMENT_TERMS;
