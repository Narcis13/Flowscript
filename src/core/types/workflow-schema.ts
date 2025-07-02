/**
 * Zod schemas for workflow validation
 */

import { z } from 'zod';

// Base node reference can be a string or object with config
export const NodeReferenceSchema = z.union([
  z.string(),
  z.record(z.string(), z.any())
]);

// Branch map schema
export const BranchMapSchema = z.record(
  z.string(),
  z.union([
    NodeReferenceSchema,
    z.array(NodeReferenceSchema),
    z.null()
  ])
);

// Loop controller schema
export const LoopControllerSchema = z.union([
  z.string(),
  z.record(z.string(), z.any())
]);

// Flow element can be various types
export const FlowElementSchema: z.ZodType<any> = z.lazy(() =>
  z.union([
    // Simple node reference
    NodeReferenceSchema,
    // Branch structure: [condition, branches]
    z.tuple([
      NodeReferenceSchema,
      BranchMapSchema
    ]),
    // Loop structure: [controller, body]
    z.tuple([
      LoopControllerSchema,
      z.array(FlowElementSchema)
    ])
  ])
);

// Complete workflow definition schema
export const WorkflowDefinitionSchema = z.object({
  id: z.string().min(1, "Workflow ID is required"),
  name: z.string().min(1, "Workflow name is required"),
  description: z.string().optional(),
  version: z.string().optional(),
  initialState: z.record(z.any()).default({}),
  nodes: z.array(FlowElementSchema),
  metadata: z.object({
    author: z.string().optional(),
    created: z.string().datetime().optional(),
    updated: z.string().datetime().optional(),
    tags: z.array(z.string()).optional()
  }).optional()
});

// Re-export the inferred types
export type ValidatedWorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>;
export type ValidatedFlowElement = z.infer<typeof FlowElementSchema>;
export type ValidatedBranchMap = z.infer<typeof BranchMapSchema>;