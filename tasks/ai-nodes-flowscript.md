# Essential AI Nodes for FlowScript - Vercel AI SDK Integration

## Core Text Generation Nodes

### 1. **generateText**
```typescript
export const generateText: Node = {
  metadata: {
    name: "generateText",
    description: "Generate text using AI models with optional tool support",
    type: "action",
    ai_hints: {
      purpose: "Single-shot text generation with AI models",
      when_to_use: "When you need a complete AI response without streaming",
      expected_edges: ["success", "error", "toolCallRequired"],
      example_usage: "Get AI to answer questions, generate content, or analyze data"
    }
  },
  
  execute: async ({ state, config }) => {
    const { model, prompt, messages, tools, temperature, maxTokens } = config;
    
    try {
      const result = await generateText({
        model: getModel(model),
        prompt: prompt || state.get(config.promptPath),
        messages: messages || state.get(config.messagesPath),
        tools: tools ? loadTools(tools) : undefined,
        temperature,
        maxOutputTokens: maxTokens
      });
      
      if (result.toolCalls?.length > 0) {
        return {
          toolCallRequired: () => ({
            text: result.text,
            toolCalls: result.toolCalls,
            usage: result.usage
          })
        };
      }
      
      return {
        success: () => ({
          text: result.text,
          finishReason: result.finishReason,
          usage: result.usage,
          response: result.response
        })
      };
    } catch (error) {
      return {
        error: () => ({ message: error.message, code: error.code })
      };
    }
  }
};
```

### 2. **streamText**
```typescript
export const streamText: Node = {
  metadata: {
    name: "streamText",
    description: "Stream text generation for real-time responses",
    type: "action",
    ai_hints: {
      purpose: "Stream AI responses for better UX with long outputs",
      when_to_use: "When generating long content or need real-time feedback",
      expected_edges: ["streaming", "complete", "error", "toolCallStreaming"],
      example_usage: "Chat interfaces, real-time content generation"
    }
  },
  
  execute: async ({ state, runtime, config }) => {
    const { model, prompt, messages, tools, onChunk } = config;
    
    try {
      const result = streamText({
        model: getModel(model),
        prompt: prompt || state.get(config.promptPath),
        messages: messages || state.get(config.messagesPath),
        tools: tools ? loadTools(tools) : undefined,
        onChunk: ({ chunk }) => {
          runtime.emit({
            type: 'ai_stream_chunk',
            chunk
          });
          
          if (onChunk) {
            state.update({ lastChunk: chunk });
          }
        }
      });
      
      // Store stream reference for potential interruption
      state.set('$.activeStream', result);
      
      return {
        streaming: () => ({
          streamId: runtime.executionId,
          startedAt: Date.now()
        })
      };
    } catch (error) {
      return {
        error: () => ({ message: error.message })
      };
    }
  }
};
```

## Structured Data Generation Nodes

### 3. **generateObject**
```typescript
export const generateObject: Node = {
  metadata: {
    name: "generateObject",
    description: "Generate structured JSON objects using AI",
    type: "action",
    ai_hints: {
      purpose: "Generate validated structured data from AI",
      when_to_use: "When you need AI to output specific data structures",
      expected_edges: ["success", "validationError", "error"],
      example_usage: "Extract structured info, generate forms, create data models"
    }
  },
  
  execute: async ({ state, config }) => {
    const { model, schema, prompt, messages } = config;
    
    try {
      const result = await generateObject({
        model: getModel(model),
        schema: parseSchema(schema), // Zod or JSON schema
        prompt: prompt || state.get(config.promptPath),
        messages: messages || state.get(config.messagesPath)
      });
      
      return {
        success: () => ({
          object: result.object,
          usage: result.usage,
          finishReason: result.finishReason
        })
      };
    } catch (error) {
      if (error.type === 'validation') {
        return {
          validationError: () => ({
            message: error.message,
            errors: error.errors
          })
        };
      }
      
      return {
        error: () => ({ message: error.message })
      };
    }
  }
};
```

### 4. **streamObject**
```typescript
export const streamObject: Node = {
  metadata: {
    name: "streamObject",
    description: "Stream structured object generation",
    type: "action",
    ai_hints: {
      purpose: "Stream partial objects as they're generated",
      when_to_use: "For progressive UI updates with structured data",
      expected_edges: ["streaming", "complete", "error"],
      example_usage: "Real-time form generation, progressive data extraction"
    }
  },
  
  execute: async ({ state, runtime, config }) => {
    const { model, schema, output, prompt } = config;
    
    try {
      const result = streamObject({
        model: getModel(model),
        schema: parseSchema(schema),
        output: output || 'object', // 'object' | 'array' | 'enum'
        prompt: prompt || state.get(config.promptPath)
      });
      
      // Stream partial objects
      (async () => {
        for await (const partialObject of result.partialObjectStream) {
          runtime.emit({
            type: 'ai_partial_object',
            data: partialObject
          });
        }
      })();
      
      return {
        streaming: () => ({
          streamType: 'object',
          schema: schema
        })
      };
    } catch (error) {
      return {
        error: () => ({ message: error.message })
      };
    }
  }
};
```

## Embedding Nodes

### 5. **generateEmbedding**
```typescript
export const generateEmbedding: Node = {
  metadata: {
    name: "generateEmbedding",
    description: "Generate embeddings for text",
    type: "action",
    ai_hints: {
      purpose: "Convert text to vector embeddings",
      when_to_use: "For semantic search, similarity, or RAG applications",
      expected_edges: ["success", "error"],
      example_usage: "Create searchable embeddings, find similar content"
    }
  },
  
  execute: async ({ state, config }) => {
    const { model, text, dimensions } = config;
    
    try {
      const result = await embed({
        model: getEmbeddingModel(model),
        value: text || state.get(config.textPath),
        providerOptions: dimensions ? { dimensions } : undefined
      });
      
      return {
        success: () => ({
          embedding: result.embedding,
          usage: result.usage
        })
      };
    } catch (error) {
      return {
        error: () => ({ message: error.message })
      };
    }
  }
};
```

### 6. **embedMultiple**
```typescript
export const embedMultiple: Node = {
  metadata: {
    name: "embedMultiple",
    description: "Generate embeddings for multiple texts",
    type: "action",
    ai_hints: {
      purpose: "Batch embedding generation for efficiency",
      when_to_use: "When processing multiple texts for vector storage",
      expected_edges: ["success", "error"],
      example_usage: "Index documents, batch similarity processing"
    }
  },
  
  execute: async ({ state, config }) => {
    const { model, texts, chunkSize } = config;
    
    try {
      const values = texts || state.get(config.textsPath);
      const chunks = chunkArray(values, chunkSize || 100);
      
      const allEmbeddings = [];
      
      for (const chunk of chunks) {
        const result = await embedMany({
          model: getEmbeddingModel(model),
          values: chunk
        });
        
        allEmbeddings.push(...result.embeddings);
      }
      
      return {
        success: () => ({
          embeddings: allEmbeddings,
          count: allEmbeddings.length
        })
      };
    } catch (error) {
      return {
        error: () => ({ message: error.message })
      };
    }
  }
};
```

## Tool Integration Nodes

### 7. **aiToolCall**
```typescript
export const aiToolCall: Node = {
  metadata: {
    name: "aiToolCall",
    description: "Execute AI with specific tool requirements",
    type: "action",
    ai_hints: {
      purpose: "Force AI to use specific tools",
      when_to_use: "When you need AI to execute specific functions",
      expected_edges: ["toolExecuted", "toolFailed", "error"],
      example_usage: "Structured workflows requiring specific AI actions"
    }
  },
  
  execute: async ({ state, config }) => {
    const { model, toolName, toolChoice, prompt } = config;
    
    try {
      const result = await generateText({
        model: getModel(model),
        prompt: prompt || state.get(config.promptPath),
        toolChoice: toolChoice || { type: 'tool', toolName },
        tools: {
          [toolName]: loadTool(toolName)
        }
      });
      
      if (result.toolCalls?.[0]?.toolName === toolName) {
        return {
          toolExecuted: () => ({
            toolName,
            args: result.toolCalls[0].args,
            result: result.toolResults?.[0]
          })
        };
      }
      
      return {
        toolFailed: () => ({
          reason: 'Tool not called',
          text: result.text
        })
      };
    } catch (error) {
      return {
        error: () => ({ message: error.message })
      };
    }
  }
};
```

## Conversation Management Nodes

### 8. **continueConversation**
```typescript
export const continueConversation: Node = {
  metadata: {
    name: "continueConversation",
    description: "Continue an AI conversation with context",
    type: "action",
    ai_hints: {
      purpose: "Maintain conversation context across multiple turns",
      when_to_use: "For chat interfaces and multi-turn interactions",
      expected_edges: ["responded", "toolsUsed", "error"],
      example_usage: "Chatbots, conversational AI, context-aware responses"
    }
  },
  
  execute: async ({ state, config }) => {
    const { model, userMessage, maxSteps } = config;
    
    try {
      const messages = state.get('$.conversation.messages') || [];
      messages.push({ role: 'user', content: userMessage });
      
      const result = await generateText({
        model: getModel(model),
        messages: convertToModelMessages(messages),
        maxSteps: maxSteps || 5,
        tools: loadConversationTools()
      });
      
      // Update conversation history
      messages.push(...result.response.messages);
      
      return {
        responded: () => ({
          assistantMessage: result.text,
          messages,
          toolsUsed: result.toolCalls?.length > 0
        })
      };
    } catch (error) {
      return {
        error: () => ({ message: error.message })
      };
    }
  }
};
```

## Advanced Control Nodes

### 9. **aiConditional**
```typescript
export const aiConditional: Node = {
  metadata: {
    name: "aiConditional",
    description: "AI-powered conditional branching",
    type: "control",
    ai_hints: {
      purpose: "Use AI to determine workflow branches",
      when_to_use: "When branching logic requires AI understanding",
      expected_edges: ["branch_a", "branch_b", "branch_c", "unclear"],
      example_usage: "Intent classification, smart routing"
    }
  },
  
  execute: async ({ state, config }) => {
    const { model, condition, branches } = config;
    
    try {
      const result = await generateObject({
        model: getModel(model),
        schema: z.object({
          branch: z.enum(branches),
          confidence: z.number(),
          reasoning: z.string()
        }),
        prompt: `Evaluate: ${condition}\nContext: ${JSON.stringify(state.get('$'))}`
      });
      
      if (result.object.confidence < 0.7) {
        return {
          unclear: () => ({
            reasoning: result.object.reasoning,
            confidence: result.object.confidence
          })
        };
      }
      
      return {
        [result.object.branch]: () => ({
          reasoning: result.object.reasoning,
          confidence: result.object.confidence
        })
      };
    } catch (error) {
      return {
        error: () => ({ message: error.message })
      };
    }
  }
};
```

### 10. **aiLoop**
```typescript
export const aiLoop: Node = {
  metadata: {
    name: "aiLoop",
    description: "AI-controlled loop iterations",
    type: "control",
    ai_hints: {
      purpose: "Let AI decide when to continue or exit loops",
      when_to_use: "For intelligent iteration control",
      expected_edges: ["next_iteration", "exit_loop"],
      example_usage: "Refinement loops, quality checks"
    }
  },
  
  execute: async ({ state, config }) => {
    const { model, exitCondition, maxIterations } = config;
    
    const currentIteration = state.get('$.loopIteration') || 0;
    
    if (currentIteration >= (maxIterations || 10)) {
      return {
        exit_loop: () => ({
          reason: 'Max iterations reached',
          iterations: currentIteration
        })
      };
    }
    
    try {
      const result = await generateObject({
        model: getModel(model),
        schema: z.object({
          shouldContinue: z.boolean(),
          reason: z.string()
        }),
        prompt: `Evaluate loop condition: ${exitCondition}\nCurrent state: ${JSON.stringify(state.get('$'))}`
      });
      
      if (result.object.shouldContinue) {
        return {
          next_iteration: () => ({
            iteration: currentIteration + 1,
            reason: result.object.reason
          })
        };
      }
      
      return {
        exit_loop: () => ({
          reason: result.object.reason,
          iterations: currentIteration
        })
      };
    } catch (error) {
      return {
        exit_loop: () => ({
          reason: 'Error in AI evaluation',
          error: error.message
        })
      };
    }
  }
};
```

## Multi-Modal Nodes

### 11. **analyzeImage**
```typescript
export const analyzeImage: Node = {
  metadata: {
    name: "analyzeImage",
    description: "Analyze images using vision-capable AI models",
    type: "action",
    ai_hints: {
      purpose: "Extract information from images",
      when_to_use: "For image understanding and analysis",
      expected_edges: ["analyzed", "unsupported", "error"],
      example_usage: "Image classification, OCR, visual QA"
    }
  },
  
  execute: async ({ state, config }) => {
    const { model, imageUrl, prompt } = config;
    
    try {
      const result = await generateText({
        model: getModel(model),
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { 
              type: 'file', 
              data: imageUrl, 
              mediaType: 'image/jpeg' 
            }
          ]
        }]
      });
      
      return {
        analyzed: () => ({
          description: result.text,
          usage: result.usage
        })
      };
    } catch (error) {
      if (error.message.includes('vision')) {
        return {
          unsupported: () => ({
            message: 'Model does not support image input'
          })
        };
      }
      
      return {
        error: () => ({ message: error.message })
      };
    }
  }
};
```

## Specialized Nodes

### 12. **aiDataExtractor**
```typescript
export const aiDataExtractor: Node = {
  metadata: {
    name: "aiDataExtractor",
    description: "Extract structured data from unstructured text",
    type: "action",
    ai_hints: {
      purpose: "Parse and extract specific data from text",
      when_to_use: "For data mining and information extraction",
      expected_edges: ["extracted", "noData", "error"],
      example_usage: "Extract emails, dates, entities from documents"
    }
  },
  
  execute: async ({ state, config }) => {
    const { model, text, extractionSchema } = config;
    
    try {
      const result = await generateObject({
        model: getModel(model),
        schema: parseSchema(extractionSchema),
        prompt: `Extract the following information from this text: ${text}`
      });
      
      const hasData = Object.values(result.object).some(v => v !== null);
      
      if (!hasData) {
        return {
          noData: () => ({
            message: 'No relevant data found in text'
          })
        };
      }
      
      return {
        extracted: () => ({
          data: result.object,
          confidence: result.response?.confidence
        })
      };
    } catch (error) {
      return {
        error: () => ({ message: error.message })
      };
    }
  }
};
```

### 13. **aiSummarizer**
```typescript
export const aiSummarizer: Node = {
  metadata: {
    name: "aiSummarizer",
    description: "Summarize long texts intelligently",
    type: "action",
    ai_hints: {
      purpose: "Create concise summaries of longer content",
      when_to_use: "For document summarization and content compression",
      expected_edges: ["summarized", "tooShort", "error"],
      example_usage: "Document summaries, meeting notes, article digests"
    }
  },
  
  execute: async ({ state, config }) => {
    const { model, text, style, maxLength } = config;
    
    const inputText = text || state.get(config.textPath);
    
    if (inputText.length < 100) {
      return {
        tooShort: () => ({
          message: 'Text too short to summarize',
          originalLength: inputText.length
        })
      };
    }
    
    try {
      const result = await generateText({
        model: getModel(model),
        prompt: `Summarize the following text in ${style || 'concise'} style. Max ${maxLength || 200} words:\n\n${inputText}`,
        maxOutputTokens: Math.floor((maxLength || 200) * 1.5)
      });
      
      return {
        summarized: () => ({
          summary: result.text,
          reductionRatio: inputText.length / result.text.length,
          usage: result.usage
        })
      };
    } catch (error) {
      return {
        error: () => ({ message: error.message })
      };
    }
  }
};
```

### 14. **aiTranslator**
```typescript
export const aiTranslator: Node = {
  metadata: {
    name: "aiTranslator",
    description: "Translate text between languages",
    type: "action",
    ai_hints: {
      purpose: "Language translation with context awareness",
      when_to_use: "For multilingual content processing",
      expected_edges: ["translated", "unsupportedLanguage", "error"],
      example_usage: "Document translation, chat translation"
    }
  },
  
  execute: async ({ state, config }) => {
    const { model, text, sourceLang, targetLang, preserveFormatting } = config;
    
    try {
      const schema = preserveFormatting 
        ? z.object({
            translation: z.string(),
            preservedElements: z.array(z.string()).optional()
          })
        : z.object({ translation: z.string() });
      
      const result = await generateObject({
        model: getModel(model),
        schema,
        prompt: `Translate from ${sourceLang || 'auto'} to ${targetLang}:\n${text}`
      });
      
      return {
        translated: () => ({
          translation: result.object.translation,
          sourceLang: sourceLang || 'detected',
          targetLang,
          preservedElements: result.object.preservedElements
        })
      };
    } catch (error) {
      return {
        error: () => ({ message: error.message })
      };
    }
  }
};
```

### 15. **aiCodeGenerator**
```typescript
export const aiCodeGenerator: Node = {
  metadata: {
    name: "aiCodeGenerator",
    description: "Generate code snippets or complete functions",
    type: "action",
    ai_hints: {
      purpose: "AI-powered code generation",
      when_to_use: "For automated coding tasks",
      expected_edges: ["generated", "syntaxError", "error"],
      example_usage: "Generate functions, convert pseudocode, create templates"
    }
  },
  
  execute: async ({ state, config }) => {
    const { model, language, specification, validateSyntax } = config;
    
    try {
      const result = await generateObject({
        model: getModel(model),
        schema: z.object({
          code: z.string(),
          language: z.string(),
          explanation: z.string().optional()
        }),
        prompt: `Generate ${language} code:\n${specification}`,
        temperature: 0.3 // Lower temperature for code generation
      });
      
      if (validateSyntax) {
        const isValid = await validateCode(result.object.code, language);
        if (!isValid) {
          return {
            syntaxError: () => ({
              code: result.object.code,
              message: 'Generated code has syntax errors'
            })
          };
        }
      }
      
      return {
        generated: () => ({
          code: result.object.code,
          language: result.object.language,
          explanation: result.object.explanation
        })
      };
    } catch (error) {
      return {
        error: () => ({ message: error.message })
      };
    }
  }
};
```

## Human-AI Collaboration Nodes

### 16. **aiAssistedReview**
```typescript
export const aiAssistedReview: Node = {
  metadata: {
    name: "aiAssistedReview",
    description: "AI prepares content for human review",
    type: "human",
    ai_hints: {
      purpose: "Combine AI analysis with human judgment",
      when_to_use: "For quality control and decision support",
      expected_edges: ["approved", "rejected", "needsRevision"],
      example_usage: "Content moderation, document review"
    },
    humanInteraction: {
      formSchema: {
        type: "object",
        properties: {
          decision: {
            type: "string",
            enum: ["approve", "reject", "revise"]
          },
          feedback: { type: "string" },
          revisions: { type: "array", items: { type: "string" } }
        },
        required: ["decision"]
      }
    }
  },
  
  execute: async ({ state, runtime, config }) => {
    const { model, content, reviewCriteria } = config;
    
    // First, get AI analysis
    const aiAnalysis = await generateObject({
      model: getModel(model),
      schema: z.object({
        summary: z.string(),
        issues: z.array(z.string()),
        recommendations: z.array(z.string()),
        riskScore: z.number().min(0).max(10)
      }),
      prompt: `Analyze for review:\nCriteria: ${reviewCriteria}\nContent: ${content}`
    });
    
    // Present to human with AI insights
    runtime.emit({
      type: 'human_interaction_required',
      nodeInfo: {
        name: 'aiAssistedReview',
        formSchema: aiAssistedReview.metadata.humanInteraction?.formSchema,
        contextData: {
          content,
          aiAnalysis: aiAnalysis.object
        }
      }
    });
    
    const pauseToken = runtime.pause();
    const response = await runtime.waitForResume(pauseToken);
    
    switch (response.decision) {
      case 'approve':
        return {
          approved: () => ({
            approvedBy: response.userId,
            aiRiskScore: aiAnalysis.object.riskScore,
            feedback: response.feedback
          })
        };
      case 'reject':
        return {
          rejected: () => ({
            rejectedBy: response.userId,
            reasons: [...aiAnalysis.object.issues, response.feedback]
          })
        };
      case 'revise':
        return {
          needsRevision: () => ({
            revisions: response.revisions,
            aiRecommendations: aiAnalysis.object.recommendations
          })
        };
    }
  }
};
```

## Utility and Helper Nodes

### 17. **aiModelSelector**
```typescript
export const aiModelSelector: Node = {
  metadata: {
    name: "aiModelSelector",
    description: "Dynamically select the best AI model for a task",
    type: "action",
    ai_hints: {
      purpose: "Optimize model selection based on task requirements",
      when_to_use: "When different tasks need different models",
      expected_edges: ["selected", "error"],
      example_usage: "Cost optimization, capability matching"
    }
  },
  
  execute: async ({ state, config }) => {
    const { task, requirements, budget } = config;
    
    const modelCapabilities = {
      'gpt-4.1': { 
        cost: 'high', 
        capabilities: ['complex-reasoning', 'tools', 'vision'],
        speed: 'medium'
      },
      'gpt-4.1-mini': { 
        cost: 'medium', 
        capabilities: ['reasoning', 'tools'],
        speed: 'fast'
      },
      'claude-3-7-sonnet': {
        cost: 'medium',
        capabilities: ['long-context', 'tools', 'vision'],
        speed: 'medium'
      }
    };
    
    // Simple selection logic (can be enhanced)
    let selectedModel = 'gpt-4.1-mini'; // default
    
    if (requirements?.includes('vision')) {
      selectedModel = 'gpt-4.1';
    } else if (requirements?.includes('long-context')) {
      selectedModel = 'claude-3-7-sonnet';
    } else if (budget === 'low') {
      selectedModel = 'gpt-4.1-mini';
    }
    
    return {
      selected: () => ({
        model: selectedModel,
        reasoning: `Selected based on requirements: ${requirements?.join(', ')}`,
        capabilities: modelCapabilities[selectedModel]
      })
    };
  }
};
```

### 18. **aiErrorHandler**
```typescript
export const aiErrorHandler: Node = {
  metadata: {
    name: "aiErrorHandler",
    description: "AI-powered error analysis and recovery",
    type: "action",
    ai_hints: {
      purpose: "Intelligently handle and recover from errors",
      when_to_use: "In error handling branches",
      expected_edges: ["retry", "fallback", "escalate"],
      example_usage: "Smart error recovery, user-friendly error messages"
    }
  },
  
  execute: async ({ state, config }) => {
    const { model, error, context, maxRetries } = config;
    
    const currentRetries = state.get('$.errorRetries') || 0;
    
    try {
      const result = await generateObject({
        model: getModel(model),
        schema: z.object({
          strategy: z.enum(['retry', 'fallback', 'escalate']),
          reason: z.string(),
          userMessage: z.string(),
          suggestedFix: z.string().optional()
        }),
        prompt: `Analyze error and suggest recovery:
Error: ${error}
Context: ${JSON.stringify(context)}
Retries: ${currentRetries}/${maxRetries || 3}`
      });
      
      return {
        [result.object.strategy]: () => ({
          reason: result.object.reason,
          userMessage: result.object.userMessage,
          suggestedFix: result.object.suggestedFix,
          retryCount: currentRetries + 1
        })
      };
    } catch (analysisError) {
      // Fallback if AI analysis fails
      return {
        escalate: () => ({
          reason: 'AI error analysis failed',
          originalError: error,
          analysisError: analysisError.message
        })
      };
    }
  }
};
```

## Configuration Example

```json
{
  "id": "ai-powered-document-processor",
  "initialState": {
    "documents": [],
    "processedCount": 0,
    "errors": []
  },
  "nodes": [
    "initializeProcessor",
    [
      { "forEach": { "items": "state.documents", "as": "currentDoc" } },
      [
        { "analyzeImage": { 
          "model": "gpt-4.1", 
          "imageUrl": "state.currentDoc.url",
          "prompt": "Extract text and describe document type"
        }},
        [
          "analyzeImage",
          {
            "analyzed": [
              { "aiDataExtractor": {
                "model": "gpt-4.1-mini",
                "text": "state.lastAnalysis.description",
                "extractionSchema": {
                  "documentType": "string",
                  "date": "string?",
                  "amount": "number?",
                  "parties": "string[]"
                }
              }},
              { "aiSummarizer": {
                "model": "gpt-4.1-mini",
                "textPath": "$.lastAnalysis.description",
                "style": "bullet-points",
                "maxLength": 100
              }},
              "saveProcessedDocument"
            ],
            "error": [
              { "aiErrorHandler": {
                "model": "gpt-4.1-mini",
                "error": "state.lastError",
                "context": { "document": "state.currentDoc" }
              }},
              [
                "aiErrorHandler",
                {
                  "retry": "loopTo:analyzeImage",
                  "fallback": "manualReview",
                  "escalate": "notifyAdmin"
                }
              ]
            ]
          }
        ]
      ]
    ],
    { "generateText": {
      "model": "gpt-4.1",
      "prompt": "Generate processing report for {{state.processedCount}} documents",
      "temperature": 0.7
    }},
    "sendReport"
  ]
}
```

## Best Practices

1. **Model Selection**: Use `aiModelSelector` node to dynamically choose models based on task requirements and cost constraints.

2. **Error Handling**: Implement `aiErrorHandler` nodes in error branches for intelligent recovery strategies.

3. **Streaming vs Non-Streaming**: Use streaming nodes for long outputs or real-time feedback; use non-streaming for quick responses or when you need the complete result before proceeding.

4. **Tool Integration**: Define reusable tools that can be shared across multiple AI nodes for consistency.

5. **Human-AI Collaboration**: Use `aiAssistedReview` pattern for critical decisions that benefit from both AI analysis and human judgment.

6. **Context Management**: Use `continueConversation` for maintaining context across multiple AI interactions.

7. **Structured Output**: Prefer `generateObject`/`streamObject` when you need validated, structured data from AI.

8. **Performance**: Batch operations with `embedMultiple` for better performance when processing multiple items.

9. **Monitoring**: All AI nodes emit events that can be monitored for usage, performance, and error tracking.

10. **Temperature Control**: Lower temperature (0.3-0.5) for structured data and code generation; higher (0.7-0.9) for creative tasks.