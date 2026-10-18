import { parquetMetadataAsync, parquetRead, parquetSchema, type AsyncBuffer, type FileMetaData, type SchemaTree } from "hyparquet";
import { compressors } from "hyparquet-compressors";

function leafType(tree: SchemaTree): string {
  const { element } = tree;
  const logical = element.logical_type;
  if (logical) {
    switch (logical.type) {
      case "DECIMAL":
        return `decimal(${logical.precision},${logical.scale})`;
      case "TIMESTAMP":
      case "TIME":
        return `${logical.type.toLowerCase()}(${logical.unit.toLowerCase()})`;
      case "INTEGER":
        return `${logical.isSigned ? "int" : "uint"}${logical.bitWidth}`;
      default:
        return logical.type.toLowerCase();
    }
  }
  if (element.converted_type) return element.converted_type.toLowerCase();
  return (element.type ?? "group").toLowerCase();
}

/** A compact type name for a column, nested types spelled out: `list<string>`, `struct<a, b>`. */
export function typeName(tree: SchemaTree): string {
  const { element, children } = tree;
  if (!children.length) return leafType(tree);
  const kind = element.logical_type?.type ?? element.converted_type;
  if (kind === "LIST") {
    const repeated = children[0];
    const item = repeated?.children.length === 1 ? repeated.children[0] : repeated;
    return `list<${item ? typeName(item) : "?"}>`;
  }
  if (kind === "MAP" || kind === "MAP_KEY_VALUE") {
    const [key, value] = children[0]?.children ?? [];
    return `map<${key ? typeName(key) : "?"}, ${value ? typeName(value) : "?"}>`;
  }
  return `struct<${children.map((child) => child.element.name).join(", ")}>`;
}

export interface ParquetFile {
  file: AsyncBuffer;
  metadata: FileMetaData;
  schema: SchemaTree;
  rowCount: number;
}

export async function openParquet(blob: Blob): Promise<ParquetFile> {
  // Reads only the byte ranges hyparquet asks for, so a 2 GB file costs its footer plus the rows on screen.
  const file: AsyncBuffer = { byteLength: blob.size, slice: (start, end) => blob.slice(start, end).arrayBuffer() };
  const metadata = await parquetMetadataAsync(file);
  return { file, metadata, schema: parquetSchema(metadata), rowCount: Number(metadata.num_rows) };
}

export async function readRows(parquet: ParquetFile, rowStart: number, rowEnd: number): Promise<unknown[][]> {
  let rows: unknown[][] = [];
  await parquetRead({
    file: parquet.file,
    metadata: parquet.metadata,
    compressors,
    rowStart,
    rowEnd,
    onComplete: (data) => {
      rows = data;
    },
  });
  return rows;
}
