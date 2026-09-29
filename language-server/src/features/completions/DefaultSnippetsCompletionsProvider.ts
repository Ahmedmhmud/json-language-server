import { CompletionItemKind, InsertTextFormat } from "vscode-languageserver";
import { JsonDocument } from "../../models/JsonDocument.ts";
import { Completions } from "./Completions.ts";
import { AnnotationsEvaluationPlugin } from "../AnnotationsEvaluationPlugin.ts";

import type { CompletionsProvider } from "./Completions.ts";
import type { CompletionItem, CompletionParams } from "vscode-languageserver";
import type { JsonSchema } from "../../services/JsonSchema.ts";

type DefaultSnippet = {
  label?: string;
  description?: string;
  markdownDescription?: string;
  body?: unknown;
  bodyText?: string;
};

export class DefaultSnippetsCompletionsProvider implements CompletionsProvider {
  private jsonSchema: JsonSchema;

  constructor(jsonSchema: JsonSchema) {
    this.jsonSchema = jsonSchema;
  }

  async getCompletions(jsonDocument: JsonDocument, params: CompletionParams) {
    const location = Completions.findInstanceLocationAndRange(jsonDocument, params);
    if (!location) {
      return [];
    }

    const { instanceLocation, range } = location;
    const completions: CompletionItem[] = [];

    try {
      const result = await this.jsonSchema.validate(jsonDocument);
      const annotationsPlugin = result.plugins.get(AnnotationsEvaluationPlugin.id) as AnnotationsEvaluationPlugin;

      for (const annotation of annotationsPlugin?.getAnnotations(instanceLocation) ?? []) {
        const defaultSnippets = (annotation["https://microsoft.com/keyword/defaultSnippets"]
          ?? annotation["https://json-schema.org/keyword/unknown#defaultSnippets"]
          ?? []) as DefaultSnippet[];

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
      }
    } catch {
      // No completions on schema error
    }
    return completions;
  }
}

function normalizeSnippetBody(snippet: DefaultSnippet): string {
  if (typeof snippet.bodyText === "string") {
    return snippet.bodyText;
  }

  if (snippet.body !== undefined) {
    if (typeof snippet.body === "string") {
      return snippet.body;
    }

    if (Array.isArray(snippet.body)) {
      return snippet.body
        .map((v) => typeof v === "string" ? v : JSON.stringify(v))
        .join("\n");
    }

    return JSON.stringify(snippet.body);
  }

  return "";
}
