import prettier from "prettier";

/** Runs generated code through Prettier so output reads as if a person wrote it by hand. */
export async function formatCode(code: string): Promise<string> {
  return prettier.format(code, { parser: "babel" });
}
