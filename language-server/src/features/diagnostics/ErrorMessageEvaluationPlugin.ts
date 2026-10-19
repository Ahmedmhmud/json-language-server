import * as Instance from "@hyperjump/json-schema/instance/experimental";

import type { EvaluationPlugin, Node, ValidationContext } from "@hyperjump/json-schema/experimental";
import type { JsonNode } from "@hyperjump/json-schema/instance/experimental";
import type { ErrorObject } from "@hyperjump/json-schema-errors";
import type { SchemaEvaluation } from "../../services/JsonSchema.ts";

type ErrorMessageContext = ValidationContext & {
  // The schema being evaluated
  schemaUri?: string;
  // The schema whose keyword is being evaluated
  parentSchemaUri?: string;
};

// VS Code's errorMessage and patternErrorMessage keywords replace the messages
// of some of the keywords in the same schema. They aren't annotations because
// they don't apply to keywords in other schemas, even ones that apply to the
// same instance location. Errors identify the keywords that failed by their
// instance location and schema location, so this collects the message for
// each keyword that failed at each instance location. A schema can be
// evaluated at more than one instance location, and error explanations can
// describe its keywords at locations where they didn't fail. Messages are only
// looked up when something fails.
export class ErrorMessageEvaluationPlugin implements EvaluationPlugin<ErrorMessageContext> {
  static readonly id = "error-message";

  // Keyed by instance location, then schema location
  private messages: Record<string, Record<string, string>> = Object.create(null);

  // The plugin is registered once, in SchemaValidationDiagnosticsProvider.ts
  static from(result: SchemaEvaluation): ErrorMessageEvaluationPlugin {
    const plugin = result.plugins.get(ErrorMessageEvaluationPlugin.id);
    if (!plugin) {
      throw Error(`The ${ErrorMessageEvaluationPlugin.id} evaluation plugin isn't registered`);
    }
    return plugin as ErrorMessageEvaluationPlugin;
  }

  beforeSchema(url: string, _instance: JsonNode, context: ErrorMessageContext): void {
    context.schemaUri = url;
  }

  // Subschemas are evaluated with their keyword's context
  beforeKeyword(_keywordNode: Node<unknown>, _instance: JsonNode, context: ErrorMessageContext, schemaContext: ErrorMessageContext): void {
    context.parentSchemaUri = schemaContext.schemaUri;
  }

  afterKeyword([keywordUri, keywordLocation]: Node<unknown>, instance: JsonNode, context: ErrorMessageContext, valid: boolean, schemaContext: ErrorMessageContext): void {
    if (!valid) {
      const message = keywordMessage(keywordUri, context.ast[schemaContext.schemaUri!] as Node<unknown>[]);
      if (message) {
        this.addMessage(instance, keywordLocation, message);
      }
    }
  }

  // A false schema fails at its own location rather than a keyword's. It can't
  // have a message of its own, so it uses the message of the schema that
  // applied it.
  afterSchema(url: string, instance: JsonNode, context: ErrorMessageContext): void {
    if (context.ast[url] === false && context.parentSchemaUri) {
      const message = getMessage(context.ast[context.parentSchemaUri] as Node<unknown>[], "errorMessage");
      if (message) {
        this.addMessage(instance, url, message);
      }
    }
  }

  // The schema's message for an error, if it has one. An error can combine
  // keywords from more than one schema, so it can have more than one message.
  getMessage(error: ErrorObject): string | undefined {
    const locationMessages = this.messages[error.instanceLocation] ?? {};

    const messages = new Set<string>();
    for (const schemaLocation of error.schemaLocations) {
      if (schemaLocation in locationMessages) {
        messages.add(locationMessages[schemaLocation]);
      }
    }

    return messages.size > 0 ? [...messages].join("\n") : undefined;
  }

  private addMessage(instance: JsonNode, schemaLocation: string, message: string) {
    const instanceLocation = Instance.uri(instance);
    this.messages[instanceLocation] ??= Object.create(null);
    this.messages[instanceLocation][schemaLocation] = message;
  }
}

// The message that replaces a keyword's message, if it has one
const keywordMessage = (keywordUri: string, keywordNodes: Node<unknown>[]): string | undefined => {
  if (patternErrorMessageKeywords.has(keywordUri)) {
    return getMessage(keywordNodes, "patternErrorMessage") ?? getMessage(keywordNodes, "errorMessage");
  } else if (errorMessageKeywords.has(keywordUri)) {
    return getMessage(keywordNodes, "errorMessage");
  }
};

// Schemas that don't use the VS Code vocabulary have the keyword as an unknown
// keyword, which isn't checked against the meta-schema, so the value could be
// anything. Like VS Code, an empty message is the same as no message.
const getMessage = (keywordNodes: Node<unknown>[], keyword: string): string | undefined => {
  for (const [keywordUri, , keywordValue] of keywordNodes) {
    let message: unknown;
    if (keywordUri === `https://microsoft.com/keyword/${keyword}`) {
      message = keywordValue;
    } else if (keywordUri === `https://json-schema.org/keyword/unknown#${keyword}`) {
      message = (keywordValue as [string, unknown])[1];
    } else {
      continue;
    }

    return typeof message === "string" && message !== "" ? message : undefined;
  }
};

// The keywords VS Code uses patternErrorMessage for. It's preferred over
// errorMessage.
const patternErrorMessageKeywords = new Set([
  "https://json-schema.org/keyword/pattern",
  "https://json-schema.org/keyword/format",
  "https://json-schema.org/keyword/draft-04/format",
  "https://json-schema.org/keyword/draft-06/format",
  "https://json-schema.org/keyword/draft-07/format",
  "https://json-schema.org/keyword/draft-2019-09/format",
  "https://json-schema.org/keyword/draft-2019-09/format-assertion",
  "https://json-schema.org/keyword/draft-2020-12/format",
  "https://json-schema.org/keyword/draft-2020-12/format-assertion"
]);

// The other keywords VS Code uses errorMessage for. Keywords like required,
// minLength, and maximum always use their own message. minContains and
// maxContains are evaluated by contains.
const errorMessageKeywords = new Set([
  "https://json-schema.org/keyword/type",
  "https://json-schema.org/keyword/enum",
  "https://json-schema.org/keyword/const",
  "https://json-schema.org/keyword/not",
  "https://json-schema.org/keyword/contains",
  "https://json-schema.org/keyword/draft-06/contains"
]);
