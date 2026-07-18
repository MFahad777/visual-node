import { describe, expect, it } from "vitest";
import {
  buildVariableDeclarationStatement,
  validateVariableDeclaration,
} from "../src/codegen/variable-declarations.js";
import type { VariableDeclaration } from "../src/schema/node.types.js";

function variable(overrides: Partial<VariableDeclaration>): VariableDeclaration {
  return {
    id: "v1",
    name: "x",
    keyword: "let",
    dataType: "string",
    ...overrides,
  };
}

describe("validateVariableDeclaration / buildVariableDeclarationStatement (Phase 10 dataType)", () => {
  it("rejects an invalid identifier name regardless of dataType", () => {
    const v = variable({ name: "1invalid", dataType: "number", defaultValue: "1" });
    expect(validateVariableDeclaration(v)).toMatch(/invalid name/);
    expect(() => buildVariableDeclarationStatement(v)).toThrow(/invalid name/);
  });

  describe("string", () => {
    it("accepts any raw text and JSON-stringifies it", () => {
      const v = variable({ name: "greeting", dataType: "string", defaultValue: "hi" });
      expect(validateVariableDeclaration(v)).toBeNull();
      expect(buildVariableDeclarationStatement(v)).toBe('let greeting = "hi";');
    });
  });

  describe("number", () => {
    it("accepts numeric text", () => {
      const v = variable({ name: "n", dataType: "number", defaultValue: "42" });
      expect(validateVariableDeclaration(v)).toBeNull();
      expect(buildVariableDeclarationStatement(v)).toBe("let n = 42;");
    });

    it("rejects non-numeric text", () => {
      const v = variable({ name: "n", dataType: "number", defaultValue: "abc" });
      expect(validateVariableDeclaration(v)).toMatch(/number/);
      expect(() => buildVariableDeclarationStatement(v)).toThrow(/number/);
    });
  });

  describe("boolean", () => {
    it('accepts "true"', () => {
      const v = variable({ name: "b", dataType: "boolean", defaultValue: "true" });
      expect(validateVariableDeclaration(v)).toBeNull();
      expect(buildVariableDeclarationStatement(v)).toBe("let b = true;");
    });

    it("rejects a non-boolean literal", () => {
      const v = variable({ name: "b", dataType: "boolean", defaultValue: "maybe" });
      expect(validateVariableDeclaration(v)).toMatch(/"true" or "false"/);
      expect(() => buildVariableDeclarationStatement(v)).toThrow();
    });
  });

  describe("object", () => {
    it("accepts JSON object text", () => {
      const v = variable({ name: "o", dataType: "object", defaultValue: '{"a":1}' });
      expect(validateVariableDeclaration(v)).toBeNull();
      expect(buildVariableDeclarationStatement(v)).toBe('let o = {"a":1};');
    });

    it("accepts unquoted JS object literal syntax", () => {
      const v = variable({ name: "o", dataType: "object", defaultValue: "{a:1, b:2}" });
      expect(validateVariableDeclaration(v)).toBeNull();
      expect(buildVariableDeclarationStatement(v)).toBe("let o = {a:1, b:2};");
    });

    it("accepts raw JavaScript objects with functions", () => {
      const v = variable({
        name: "o",
        dataType: "object",
        defaultValue: "{getTotal: function(x) { return x * 2; }}",
      });
      expect(validateVariableDeclaration(v)).toBeNull();
      expect(buildVariableDeclarationStatement(v)).toContain("let o = {getTotal:");
    });
  });

  describe("array", () => {
    it("accepts JSON array text", () => {
      const v = variable({ name: "a", dataType: "array", defaultValue: "[1,2,3]" });
      expect(validateVariableDeclaration(v)).toBeNull();
      expect(buildVariableDeclarationStatement(v)).toBe("let a = [1,2,3];");
    });

    it("rejects a JSON object (not an array)", () => {
      const v = variable({ name: "a", dataType: "array", defaultValue: '{"a":1}' });
      expect(validateVariableDeclaration(v)).toMatch(/JSON array/);
      expect(() => buildVariableDeclarationStatement(v)).toThrow();
    });
  });

  describe("map", () => {
    it("accepts a JSON array of pairs, wrapped in new Map(...)", () => {
      const v = variable({ name: "m", dataType: "map", defaultValue: '[["a",1]]' });
      expect(validateVariableDeclaration(v)).toBeNull();
      expect(buildVariableDeclarationStatement(v)).toBe('let m = new Map([["a",1]]);');
    });

    it("emits new Map() with no args when default value is empty", () => {
      const v = variable({ name: "m", dataType: "map", defaultValue: "" });
      expect(validateVariableDeclaration(v)).toBeNull();
      expect(buildVariableDeclarationStatement(v)).toBe("let m = new Map();");
    });

    it("rejects a non-array JSON value", () => {
      const v = variable({ name: "m", dataType: "map", defaultValue: '{"a":1}' });
      expect(validateVariableDeclaration(v)).toMatch(/JSON array of \[key, value\] pairs/);
      expect(() => buildVariableDeclarationStatement(v)).toThrow();
    });
  });

  describe("set", () => {
    it("accepts a JSON array, wrapped in new Set(...)", () => {
      const v = variable({ name: "s", dataType: "set", defaultValue: "[1,2,3]" });
      expect(validateVariableDeclaration(v)).toBeNull();
      expect(buildVariableDeclarationStatement(v)).toBe("let s = new Set([1,2,3]);");
    });

    it("emits new Set() with no args when default value is empty", () => {
      const v = variable({ name: "s", dataType: "set", defaultValue: "" });
      expect(validateVariableDeclaration(v)).toBeNull();
      expect(buildVariableDeclarationStatement(v)).toBe("let s = new Set();");
    });

    it("rejects a non-array JSON value", () => {
      const v = variable({ name: "s", dataType: "set", defaultValue: '{"a":1}' });
      expect(validateVariableDeclaration(v)).toMatch(/JSON array/);
      expect(() => buildVariableDeclarationStatement(v)).toThrow();
    });
  });

  describe("weakset", () => {
    it("accepts a JSON array of objects, wrapped in new WeakSet(...)", () => {
      const v = variable({ name: "ws", dataType: "weakset", defaultValue: '[{"a":1}]' });
      expect(validateVariableDeclaration(v)).toBeNull();
      expect(buildVariableDeclarationStatement(v)).toBe('let ws = new WeakSet([{"a":1}]);');
    });

    it("emits new WeakSet() with no args when default value is empty", () => {
      const v = variable({ name: "ws", dataType: "weakset", defaultValue: "" });
      expect(validateVariableDeclaration(v)).toBeNull();
      expect(buildVariableDeclarationStatement(v)).toBe("let ws = new WeakSet();");
    });

    it("rejects an array containing primitives", () => {
      const v = variable({ name: "ws", dataType: "weakset", defaultValue: "[1,2,3]" });
      expect(validateVariableDeclaration(v)).toMatch(/WeakSet/);
      expect(validateVariableDeclaration(v)).toMatch(/object/);
      expect(() => buildVariableDeclarationStatement(v)).toThrow();
    });
  });

  describe("bigint", () => {
    it("accepts integer text, suffixed with n", () => {
      const v = variable({ name: "big", dataType: "bigint", defaultValue: "42" });
      expect(validateVariableDeclaration(v)).toBeNull();
      expect(buildVariableDeclarationStatement(v)).toBe("let big = 42n;");
    });

    it("rejects decimal text", () => {
      const v = variable({ name: "big", dataType: "bigint", defaultValue: "3.14" });
      expect(validateVariableDeclaration(v)).toMatch(/integer/);
      expect(() => buildVariableDeclarationStatement(v)).toThrow();
    });
  });

  describe("symbol", () => {
    it("wraps raw text as the Symbol's description", () => {
      const v = variable({ name: "sym", dataType: "symbol", defaultValue: "my-symbol" });
      expect(validateVariableDeclaration(v)).toBeNull();
      expect(buildVariableDeclarationStatement(v)).toBe('let sym = Symbol("my-symbol");');
    });

    it("emits Symbol() with no args when default value is empty", () => {
      const v = variable({ name: "sym", dataType: "symbol", defaultValue: "" });
      expect(validateVariableDeclaration(v)).toBeNull();
      expect(buildVariableDeclarationStatement(v)).toBe("let sym = Symbol();");
    });
  });

  describe("buffer", () => {
    it("wraps raw text in Buffer.from(...)", () => {
      const v = variable({ name: "buf", dataType: "buffer", defaultValue: "hello" });
      expect(validateVariableDeclaration(v)).toBeNull();
      expect(buildVariableDeclarationStatement(v)).toBe('let buf = Buffer.from("hello");');
    });
  });

  describe("url", () => {
    it("accepts a syntactically valid URL, wrapped in new URL(...)", () => {
      const v = variable({ name: "u", dataType: "url", defaultValue: "https://example.com" });
      expect(validateVariableDeclaration(v)).toBeNull();
      expect(buildVariableDeclarationStatement(v)).toBe('let u = new URL("https://example.com");');
    });

    it("rejects garbage text", () => {
      const v = variable({ name: "u", dataType: "url", defaultValue: "not a url" });
      expect(validateVariableDeclaration(v)).toMatch(/valid URL/);
      expect(() => buildVariableDeclarationStatement(v)).toThrow();
    });
  });

  describe("null", () => {
    it('accepts the literal text "null"', () => {
      const v = variable({ name: "n", dataType: "null", defaultValue: "null" });
      expect(validateVariableDeclaration(v)).toBeNull();
      expect(buildVariableDeclarationStatement(v)).toBe("let n = null;");
    });

    it("rejects any other text", () => {
      const v = variable({ name: "n", dataType: "null", defaultValue: "nul" });
      expect(validateVariableDeclaration(v)).toMatch(/"null"/);
      expect(() => buildVariableDeclarationStatement(v)).toThrow();
    });
  });

  describe("undefined", () => {
    it('accepts the literal text "undefined"', () => {
      const v = variable({ name: "u", dataType: "undefined", defaultValue: "undefined" });
      expect(validateVariableDeclaration(v)).toBeNull();
      expect(buildVariableDeclarationStatement(v)).toBe("let u = undefined;");
    });

    it("an empty defaultValue is valid and means no initializer at all", () => {
      const v = variable({ name: "u", dataType: "undefined", defaultValue: "" });
      expect(validateVariableDeclaration(v)).toBeNull();
      const statement = buildVariableDeclarationStatement(v);
      expect(statement).toBe("let u;");
      expect(statement).not.toContain("=");
    });
  });

  describe("empty/absent defaultValue", () => {
    it("is always valid regardless of dataType and produces no initializer", () => {
      const v = variable({ name: "x", dataType: "number" });
      expect(validateVariableDeclaration(v)).toBeNull();
      expect(buildVariableDeclarationStatement(v)).toBe("let x;");
    });

    it("produces no statement at all for a const — `const x;` with no initializer is a JS SyntaxError", () => {
      const v = variable({ name: "x", dataType: "number", keyword: "const" });
      expect(validateVariableDeclaration(v)).toBeNull();
      expect(buildVariableDeclarationStatement(v)).toBe("");
    });
  });

  describe("error", () => {
    it("wraps the message in new Error(...)", () => {
      const v = variable({ name: "e", dataType: "error", defaultValue: "boom" });
      expect(validateVariableDeclaration(v)).toBeNull();
      expect(buildVariableDeclarationStatement(v)).toBe('let e = new Error("boom");');
    });

    it("emits new Error() with no default", () => {
      const v = variable({ name: "e", dataType: "error", defaultValue: "" });
      expect(buildVariableDeclarationStatement(v)).toBe("let e = new Error();");
    });
  });
});
