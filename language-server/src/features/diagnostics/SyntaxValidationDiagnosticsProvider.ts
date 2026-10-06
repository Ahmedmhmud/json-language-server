import { DiagnosticSeverity } from "vscode-languageserver";
import { Localization } from "../../localization/Localization.ts";

import type { DiagnosticsProvider } from "./Diagnostics.ts";
import type { Server } from "../../services/Server.ts";
import { JsonDocument } from "../../models/JsonDocument.ts";

export class SyntaxValidationDiagnosticsProvider implements DiagnosticsProvider {
  private localization: Localization;

  constructor(server: Server) {
    this.localization = Localization.forLocale();

    server.onInitialize(({ locale }) => {
      this.localization = Localization.forLocale(locale);

      return { capabilities: {} };
    });
  }

  async getDiagnostics(jsonDocument: JsonDocument) {
    return jsonDocument.getParseErrors().map((error) => ({
      severity: DiagnosticSeverity.Error,
      range: jsonDocument.rangeAt(error.offset, error.offset + error.length),
      message: this.localization.getSyntaxErrorMessage(error),
      source: "hyperjump-json-language-server"
    }));
  }
}
