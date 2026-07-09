import { json } from "@codemirror/lang-json";
import { javascript } from "@codemirror/lang-javascript";
import { vscodeDark } from "@uiw/codemirror-theme-vscode";
import type { Extension } from "@uiw/react-codemirror";
import type { ConfigField } from "@visual-node/core";

/**
 * Shared CodeMirror setup for every `"code"`-type config field, used by both the
 * embedded 140px fields in NodeConfigPanel.tsx and the full-screen CodeExpandModal —
 * kept in one place so neither duplicates the theme/basicSetup/extension-choice logic.
 */
export const CODE_MIRROR_THEME = vscodeDark;
export const CODE_MIRROR_BASIC_SETUP = { lineNumbers: false, foldGutter: false };

/**
 * The existing heuristic for which language a "code"-type field represents:
 * a string `default` means raw JS (e.g. logic.handlerFunction's `body`, logic.function's
 * `body`); anything else (object/array/undefined) means JSON (e.g. handler.sendJson's
 * response body).
 */
export function isJsCodeField(field: ConfigField): boolean {
  return typeof field.default === "string";
}

export function extensionsForField(field: ConfigField): Extension[] {
  return isJsCodeField(field) ? [javascript()] : [json()];
}
