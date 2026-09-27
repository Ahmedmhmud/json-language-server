import { CompletionItemKind, InsertTextFormat } from "vscode-languageserver";
import { JsonDocument } from "../../models/JsonDocument.ts";
import { Completions } from "./Completions.ts";

import type { CompletionsProvider } from "./Completions.ts";
import type { CompletionItem, CompletionParams } from "vscode-languageserver";
import type { CompletionsEvaluationPlugin } from "./CompletionsEvaluationPlugin.ts";
import type { JsonSchema } from "../../services/JsonSchema.ts";

export class ValueCompletionsProvider implements CompletionsProvider {
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

    const cursorOffset = jsonDocument.offsetAt(params.position);
    const completions: CompletionItem[] = [];

    try {
      const result = await this.jsonSchema.validate(jsonDocument);
      const plugin = result.plugins.get("completions") as CompletionsEvaluationPlugin;

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
    } catch {
      // No completions on schema error
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
