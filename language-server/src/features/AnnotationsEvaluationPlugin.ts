import type { EvaluationPlugin, ValidationContext } from "@hyperjump/json-schema/experimental";
import type { JsonNode } from "@hyperjump/json-schema/instance/experimental";
import type { Node, Keyword } from "@hyperjump/json-schema/experimental";

type Annotation = Record<string, unknown>;

type MatchingSchemaContext = ValidationContext & {
  pendingAnnotations?: Annotation;
};

export class AnnotationsEvaluationPlugin implements EvaluationPlugin {
  static readonly id = "annotations";

  private annotations: Map<string, Annotation[]> = new Map();
  private incompleteLocations: Set<string>;

  constructor(incompleteLocations: Set<string> = new Set()) {
    this.incompleteLocations = incompleteLocations;
  }

  beforeSchema(_url: string, _instance: JsonNode, context: MatchingSchemaContext): void {
    context.pendingAnnotations = {};
  }

  afterKeyword(node: Node<unknown>, instance: JsonNode, context: MatchingSchemaContext, _valid: boolean, schemaContext: MatchingSchemaContext, keyword: Keyword<unknown>): void {
    const [keywordId, , keywordValue] = node;

    if (keyword.annotation) {
      const annotationValue = keyword.annotation(keywordValue, instance, context);
      schemaContext.pendingAnnotations ??= {};
      schemaContext.pendingAnnotations[keywordId] = annotationValue;

      if (this.incompleteLocations.has(instance.pointer)) {
        this.recordAnnotation(instance.pointer, keywordId, annotationValue);
      }
    }
  }

  afterSchema(_schemaUri: string, instance: JsonNode, context: MatchingSchemaContext, valid: boolean): void {
    if (valid && context.pendingAnnotations) {
      if (!this.annotations.has(instance.pointer)) {
        this.annotations.set(instance.pointer, []);
      }

      const existing = this.annotations.get(instance.pointer)!;
      existing.push(context.pendingAnnotations);
    }
  }

  getAnnotations(instanceLocation: string): Annotation[] {
    return this.annotations.get(instanceLocation) ?? [];
  }

  private recordAnnotation(pointer: string, keywordId: string, value: unknown) {
    const annotation = this.annotations.get(pointer) ?? [];
    annotation.push({ [keywordId]: value });
    this.annotations.set(pointer, annotation);
  }
}
