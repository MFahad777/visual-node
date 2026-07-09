import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Writes generated code to disk. Per the "hand-edit problem" (see plan section 9), this is
 * a one-way export: Visual Node never reads back or merges into a previously written file.
 */
export async function writeGeneratedFile(filePath: string, code: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, code, "utf8");
}
