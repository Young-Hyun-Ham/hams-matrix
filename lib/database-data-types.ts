type TypePolicy = {
  parameter: "none" | "length" | "precisionScale" | "fractional";
  min?: number;
  max?: number;
  maxScale?: number;
  required?: boolean;
};
const none: TypePolicy = { parameter: "none" };
const size = (max: number, required = false): TypePolicy => ({
  parameter: "length",
  min: 1,
  max,
  required,
});
const decimal = (max: number, maxScale = max): TypePolicy => ({
  parameter: "precisionScale",
  min: 1,
  max,
  maxScale,
});
const fractional = (max: number): TypePolicy => ({
  parameter: "fractional",
  min: 0,
  max,
});

// Shared by form options and server validation. This is a supported subset,
// not a complete grammar for every database version or extension.
export const DATABASE_DATA_TYPES = {
  turso: {
    label: "Turso",
    types: { INTEGER: none, REAL: none, TEXT: none, BLOB: none, NUMERIC: none },
  },
  postgresql: {
    label: "PostgreSQL",
    types: {
      SMALLINT: none,
      INTEGER: none,
      BIGINT: none,
      NUMERIC: decimal(1000),
      DECIMAL: decimal(1000),
      REAL: none,
      VARCHAR: size(10485760),
      CHAR: size(10485760),
      TEXT: none,
      BOOLEAN: none,
      DATE: none,
      TIME: fractional(6),
      TIMESTAMP: fractional(6),
      UUID: none,
      JSON: none,
      JSONB: none,
      BYTEA: none,
    },
  },
  mysql: {
    label: "MySQL",
    types: {
      TINYINT: none,
      SMALLINT: none,
      MEDIUMINT: none,
      INT: none,
      BIGINT: none,
      DECIMAL: decimal(65, 30),
      FLOAT: none,
      DOUBLE: none,
      BIT: size(64),
      CHAR: size(255),
      VARCHAR: size(65535, true),
      TEXT: none,
      BLOB: none,
      DATE: none,
      TIME: fractional(6),
      DATETIME: fractional(6),
      TIMESTAMP: fractional(6),
      JSON: none,
    },
  },
  oracle: {
    label: "Oracle",
    types: {
      CHAR: size(2000),
      NCHAR: size(1000),
      VARCHAR2: size(4000, true),
      NVARCHAR2: size(2000, true),
      NUMBER: decimal(38),
      FLOAT: size(126),
      BINARY_FLOAT: none,
      BINARY_DOUBLE: none,
      DATE: none,
      TIMESTAMP: fractional(9),
      CLOB: none,
      NCLOB: none,
      BLOB: none,
      RAW: size(2000, true),
    },
  },
} as const;
export type DatabaseType = keyof typeof DATABASE_DATA_TYPES;
export function isDatabaseType(value: unknown): value is DatabaseType {
  return typeof value === "string" && Object.hasOwn(DATABASE_DATA_TYPES, value);
}
export function databaseTypePolicy(
  database: unknown,
  type: string,
): TypePolicy | undefined {
  if (!isDatabaseType(database)) return undefined;
  const types: Record<string, TypePolicy> = DATABASE_DATA_TYPES[database].types;
  return Object.hasOwn(types, type) ? types[type] : undefined;
}
export function databaseTypeLabel(database: DatabaseType | null) {
  return database ? DATABASE_DATA_TYPES[database].label : "DB 미지정";
}
