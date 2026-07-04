import { initDB, query } from './db';

export interface DatasetConfig {
  /** Table name in DuckDB */
  table: string;
  /** URL to fetch the GeoParquet file from (relative or absolute) */
  url: string;
}

/**
 * For each dataset: check if the DuckDB table already exists (meaning the data
 * is persisted in OPFS), and if not, fetch the GeoParquet and load it.
 */
export async function ensureDatasets(datasets: DatasetConfig[]): Promise<void> {
  const db = await initDB();

  for (const ds of datasets) {
    const exists = await tableExists(ds.table);
    if (exists) {
      console.log(`[opfs] table "${ds.table}" already loaded — skipping download`);
      continue;
    }

    console.log(`[opfs] fetching ${ds.url} …`);
    const resp = await fetch(ds.url);
    if (!resp.ok) throw new Error(`Failed to fetch ${ds.url}: ${resp.status}`);
    const buf = await resp.arrayBuffer();

    // Register the parquet bytes as a virtual file in DuckDB's VFS
    const fileName = `${ds.table}.parquet`;
    await db.registerFileBuffer(fileName, new Uint8Array(buf));

    await query(
      `CREATE TABLE "${ds.table}" AS SELECT * FROM read_parquet('${fileName}')`,
      db
    );

    console.log(`[opfs] table "${ds.table}" created`);
  }
}

async function tableExists(table: string): Promise<boolean> {
  const result = await query(
    `SELECT count(*) AS n FROM information_schema.tables
     WHERE table_name = '${table}'`
  );
  const n = result.toArray()[0]?.n ?? 0;
  return Number(n) > 0;
}
