import { CompletionItemKind, InsertTextFormat } from "vscode-languageserver";
import { JsonDocument } from "../../models/JsonDocument.ts";
import * as JsonPointer from "@hyperjump/json-pointer";
import * as Pact from "@hyperjump/pact";
import { AnnotationsEvaluationPlugin } from "../AnnotationsEvaluationPlugin.ts";

import type { CompletionsProvider } from "./Completions.ts";
import type { CompletionItem, CompletionParams, Range } from "vscode-languageserver";
import type { CompletionsEvaluationPlugin } from "./CompletionsEvaluationPlugin.ts";

export class ValueCompletionsProvider implements CompletionsProvider {
  async getCompletions(jsonDocument: JsonDocument, params: CompletionParams) {
    const node = jsonDocument.findNodeAtPosition({ ...params.position, character: params.position.character - 1 })!;

    if (node.parent?.type === "property" && node.parent.colonOffset === undefined) {
      return [];
    }

    if (node.type === "property" && node.colonOffset === undefined) {
      return [];
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

    const plugin = await jsonDocument.getEvaluationPlugin("completions") as CompletionsEvaluationPlugin;
    const annotationsPlugin = await jsonDocument.getEvaluationPlugin<AnnotationsEvaluationPlugin>(
      AnnotationsEvaluationPlugin.id
    );

    const defaultSnippets = (annotationsPlugin?.getAnnotations(instanceLocation) ?? [])
      .flatMap((annotation) => {
        const value = annotation["https://microsoft.com/keyword/defaultSnippets"]
          ?? annotation["https://json-schema.org/keyword/unknown#defaultSnippets"]
          ?? annotation["https://json-schema.org/keyword/defaultSnippets"];
        return Array.isArray(value) ? value as DefaultSnippet[] : value ? [value as DefaultSnippet] : [];
      });

    const completions: CompletionItem[] = [];
    for (const completion of plugin.getCompletions(instanceLocation)) {
      const label = completion.kind === "value" ? completion.value : typeSnippets[completion.type].label;
      const snippet = completion.kind === "value" ? completion.value : typeSnippets[completion.type].snippet;

      completions.push({
        label,
        kind: CompletionItemKind.Value,
        labelDetails: {
          description: "hyperjump-json-language-server"
        },
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: range,
          newText: /^[:,]$/.test(jsonDocument.getText()[cursorOffset - 1]) ? ` ${snippet}` : snippet
        }
      });
    }

    for (const snippet of defaultSnippets) {
      completions.push({
        label: snippet.label ?? "snippet",
        kind: CompletionItemKind.Snippet,
        detail: snippet.description,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range,
          newText: normalizeSnippetBody(snippet)
        }
      });
    }
    return completions;
  }
}

const typeSnippets: Record<string, { label: string; snippet: string }> = {
  integer: { label: "integer", snippet: "$0" },
  number: { label: "number", snippet: "$0" },
  string: { label: `""`, snippet: `"$0"` },
  array: { label: "[]", snippet: "[$0]" },
  object: { label: "{}", snippet: "{$0}" }
};

type DefaultSnippet = {
  label?: string;
  description?: string;
  markdownDescription?: string;
  body?: string | string[];
  bodyText?: string;
};

function normalizeSnippetBody(snippet: DefaultSnippet): string {
  if (typeof snippet.body === "string") {
    return snippet.body;
  }

  if (Array.isArray(snippet.body)) {
    return snippet.body.join("\n");
  }

  return snippet.bodyText ?? "";
}
