export type DiagnosticSeverity = "error" | "warning";

export interface DiagnosticFrame {
  nodeId: string;
  nodeType: string;
  label: string;
}

export interface Diagnostic {
  severity: DiagnosticSeverity;
  message: string;
  path: DiagnosticFrame[];
}
