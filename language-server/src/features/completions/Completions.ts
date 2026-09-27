import * as JsonPointer from "@hyperjump/json-pointer";
import * as Pact from "@hyperjump/pact";
import { JsonDocuments } from "../../services/JsonDocuments.ts";
import { JsonDocument } from "../../models/JsonDocument.ts";
import { CompletionsEvaluationPlugin } from "./CompletionsEvaluationPlugin.ts";
import { AnnotationsEvaluationPlugin } from "../AnnotationsEvaluationPlugin.ts";

import type { CompletionItem, CompletionParams, ServerCapabilities } from "vscode-languageserver";
import type { JsonSchema } from "../../services/JsonSchema.ts";
import type { Server } from "../../services/Server.ts";

export type CompletionsProvider = {
  getCompletions(jsonDocument: JsonDocument, params: CompletionParams): Promise<CompletionItem[]>;
};

export class Completions {
  private jsonDocuments: JsonDocuments;
  private providers: CompletionsProvider[];

  constructor(server: Server, jsonDocuments: JsonDocuments, jsonSchema: JsonSchema, providers: CompletionsProvider[]) {
    this.jsonDocuments = jsonDocuments;
    this.providers = providers;

    jsonSchema.registerPlugin(completionsEvaluationPluginId, (jsonDocument) => {
      const incompleteLocations: Set<string> = new Set();
      const ast = jsonDocument.findNodeAtPointer("");
      if (!ast) {
        return new CompletionsEvaluationPlugin(incompleteLocations);
      }

      jsonDocument.walkNodes(ast, (node) => {
        if (node.type === "object") {
          for (const propertyNode of node.children!) {
            if (propertyNode.children!.length === 1) {
              incompleteLocations.add(jsonDocument.getPointerForNode(propertyNode));
            }
          }
        } else if (node.type === "array") {
          const pointer = JsonPointer.append(`${node.children!.length}`, jsonDocument.getPointerForNode(node));
          incompleteLocations.add(pointer);
        }
      });
      return new CompletionsEvaluationPlugin(incompleteLocations);
    });

    server.onInitialize(() => {
      const serverCapabilities: ServerCapabilities = {
        completionProvider: {
          triggerCharacters: [":", "\"", "\n", " "]
        }
      };

      return {
        capabilities: serverCapabilities
      };
    });

    server.onCompletion(async (params) => {
      const jsonDocument = this.jsonDocuments.get(params.textDocument.uri);
      if (!jsonDocument) {
        return [];
      }

      if (params.context?.triggerCharacter === " ") {
        const cursorOffset = jsonDocument.offsetAt(params.position);
        const node = jsonDocument.findNodeAtPosition(params.position);
        if (node?.type === "string" || !/[:,]/.test(jsonDocument.getText()[cursorOffset - 2])) {
          return [];
        }
      }

      const completionItems: CompletionItem[] = [];
      for (const provider of this.providers) {
        completionItems.push(...await provider.getCompletions(jsonDocument, params));
      }

      return completionItems;
    });
  }

  static getNodeAtCursor(jsonDocument: JsonDocument, params: CompletionParams) {
    return jsonDocument.findNodeAtPosition({ ...params.position, character: params.position.character - 1 });
  }

  static findInstanceLocationAndRange(jsonDocument: JsonDocument, params: CompletionParams): { instanceLocation: string; range: Range } | undefined {
    const node = Completions.getNodeAtCursor(jsonDocument, params);
    if (!node) {
      return undefined;
    }
    if (node.parent?.type === "property" && node.parent.children?.[0] === node) {
      return undefined;
    }

    if (node.type === "property" && node.colonOffset === undefined) {
      return undefined;
    }

    const cursorOffset = jsonDocument.offsetAt(params.position);

    let instanceLocation: string;
    let range: Range;

    switch (node.type) {
      case "property":
        instanceLocation = jsonDocument.getPointerForNode(node);
        range = { start: jsonDocument.positionAt(node.colonOffset! + 1), end: params.position };
        break;

      case "array":
        const index = Pact.pipe(
          node.children!,
          Pact.takeWhile((itemNode) => cursorOffset >= itemNode.offset),
          Pact.count
        );

        instanceLocation = JsonPointer.append(`${index}`, jsonDocument.getPointerForNode(node));
        range = { start: params.position, end: params.position };
        break;

      default:
        instanceLocation = jsonDocument.getPointerForNode(node);
        range = jsonDocument.rangeAt(node.offset, node.offset + node.length);
    }
    return { instanceLocation, range };
  }
}
