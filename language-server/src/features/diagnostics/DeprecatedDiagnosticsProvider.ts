import { DiagnosticSeverity, DiagnosticTag } from "vscode-languageserver";
import * as JsonPointer from "@hyperjump/json-pointer";
import * as Pact from "@hyperjump/pact";
import { LspEvaluationPlugin } from "../../evaluation/LspEvaluationPlugin.ts";

import type { Diagnostic } from "vscode-languageserver";
import type { Node } from "jsonc-parser";
import type { DiagnosticsProvider } from "./Diagnostics.ts";
import type { Annotation } from "../../evaluation/Annotation.ts";
import type { JsonDocument } from "../../models/JsonDocument.ts";
import type { JsonSchema } from "../../services/JsonSchema.ts";
import type { Server } from "../../services/Server.ts";

export class DeprecatedDiagnosticsProvider implements DiagnosticsProvider {
  private jsonSchema: JsonSchema;
  private hasDeprecatedTagCapability = false;

  constructor(server: Server, jsonSchema: JsonSchema) {
    this.jsonSchema = jsonSchema;

    server.onInitialize(({ capabilities }) => {
      // Without the deprecated tag, the client can't strike through deprecated
      // text, so the diagnostics would just be noise
      const tagSupport = capabilities.textDocument?.publishDiagnostics?.tagSupport;
      this.hasDeprecatedTagCapability = !!tagSupport?.valueSet.includes(DiagnosticTag.Deprecated);

      return { capabilities: {} };
    });
  }

  async getDiagnostics(jsonDocument: JsonDocument) {
    const diagnostics: Diagnostic[] = [];

    const ast = jsonDocument.findNodeAtPointer("");
    if (!this.hasDeprecatedTagCapability || !ast) {
      return diagnostics;
    }

    try {
      const result = await this.jsonSchema.validate(jsonDocument);
      if (!result) {
        return diagnostics;
      }

      const plugin = LspEvaluationPlugin.from(result);

      const getDeprecated = (annotations: Annotation[]) => annotations.filter((annotation) => annotation.deprecated());

      // Every schema that deprecates the node contributes its message. Like
      // VS Code, only the plain text message is used for diagnostics.
      const report = (node: Node, deprecated: Annotation[]) => {
        if (deprecated.length === 0) {
          return;
        }

        const messages = Pact.pipe(
          deprecated,
          Pact.map((annotation) => annotation.deprecationMessage()),
          Pact.filter((message) => message !== undefined),
          Pact.collectArray
        );

        diagnostics.push({
          severity: DiagnosticSeverity.Warning,
          tags: [DiagnosticTag.Deprecated],
          range: jsonDocument.rangeAt(node.offset, node.offset + node.length),
          message: messages.length > 0 ? messages.join("\n") : "Deprecated",
          source: "hyperjump-json-language-server"
        });
      };

      // A deprecated property is marked on its key no matter what its value
      // is. A deprecated value is marked on the value.
      jsonDocument.walkNodes(ast, (node, pointer) => {
        // The root and array items don't have a key, so a deprecated location
        // is marked on the value
        if (node.parent?.type !== "property") {
          report(node, [
            ...getDeprecated(plugin.getLocationAnnotations(pointer)),
            ...getDeprecated(plugin.getValueAnnotations(pointer))
          ]);
        }

        // Properties are checked from the object because walkNodes doesn't
        // visit properties that don't have a value yet
        if (node.type === "object") {
          for (const propertyNode of node.children!) {
            const [keyNode, valueNode] = propertyNode.children!;
            const propertyPointer = JsonPointer.append(keyNode.value, pointer);

            report(keyNode, getDeprecated(plugin.getLocationAnnotations(propertyPointer)));
            if (valueNode) {
              report(valueNode, getDeprecated(plugin.getValueAnnotations(propertyPointer)));
            }
          }
        }
      });
    } catch {
      // Schema errors are reported by SchemaValidationDiagnosticsProvider
    }

    return diagnostics;
  }
}
