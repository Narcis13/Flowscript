/**
 * Gmail-specific API endpoints using direct node execution
 */

import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { NodeExecutor } from '../../services/NodeExecutor';

// Query schema for listing emails
const listEmailsQuerySchema = z.object({
  email: z.string().email(),
  maxResults: z.coerce.number().min(1).max(100).optional().default(10),
  query: z.string().optional(),
  labelIds: z.string().optional(), // comma-separated list
  includeSpamTrash: z.coerce.boolean().optional().default(false)
});

/**
 * Create Gmail-specific routes
 */
export function createGmailRoutes(): Hono {
  const app = new Hono();
  const executor = NodeExecutor.getInstance();

  // Get last N emails
  app.get('/emails', async (c) => {
    // Parse query parameters
    const query = c.req.query();
    const parseResult = listEmailsQuerySchema.safeParse(query);

    if (!parseResult.success) {
      throw new HTTPException(400, {
        message: 'Invalid query parameters',
        cause: parseResult.error.errors
      });
    }

    const { email, maxResults, query: searchQuery, labelIds, includeSpamTrash } = parseResult.data;

    try {
      // Step 1: Connect to Google account
      const connectResult = await executor.executeNode('googleConnect', {
        config: { email }
      });

      // Check if connection was successful
      if (!connectResult.edges.success) {
        throw new HTTPException(401, {
          message: 'Failed to connect to Google account',
          cause: connectResult.edges.error
        });
      }

      // Step 2: List emails using the token from state
      const listResult = await executor.executeNode('listEmails', {
        initialState: connectResult.finalState,
        config: {
          maxResults,
          query: searchQuery,
          labelIds: labelIds?.split(',').filter(Boolean),
          includeSpamTrash,
          getFullDetails: true // Always get full details for API response
        }
      });

      // Check if listing was successful
      if (listResult.edges.error) {
        throw new HTTPException(500, {
          message: 'Failed to list emails',
          cause: listResult.edges.error
        });
      }

      // Get the appropriate edge data
      const emailData = listResult.edges.success || listResult.edges.no_results || { emails: [] };

      // Format response
      return c.json({
        emails: emailData.emails || [],
        total: emailData.emails?.length || 0,
        nextPageToken: emailData.nextPageToken || null,
        metadata: {
          email,
          executionTime: connectResult.metadata.duration + listResult.metadata.duration
        }
      });
    } catch (error) {
      // Re-throw HTTPExceptions
      if (error instanceof HTTPException) {
        throw error;
      }

      // Handle other errors
      throw new HTTPException(500, {
        message: 'Failed to retrieve emails',
        cause: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Send an email
  app.post('/send', async (c) => {
    const body = await c.req.json();
    
    const sendSchema = z.object({
      email: z.string().email(),
      to: z.union([z.string(), z.array(z.string())]),
      subject: z.string(),
      body: z.string(),
      cc: z.union([z.string(), z.array(z.string())]).optional(),
      bcc: z.union([z.string(), z.array(z.string())]).optional(),
      attachments: z.array(z.object({
        filename: z.string(),
        content: z.string(), // base64 encoded
        mimeType: z.string()
      })).optional()
    });

    const parseResult = sendSchema.safeParse(body);
    if (!parseResult.success) {
      throw new HTTPException(400, {
        message: 'Invalid request body',
        cause: parseResult.error.errors
      });
    }

    const { email, ...emailConfig } = parseResult.data;

    try {
      // Connect and send email
      const results = await executor.executeNodeChain(
        ['googleConnect', 'sendEmail'],
        {
          config: { email },
          previousData: emailConfig
        }
      );

      const sendResult = results[1];
      if (sendResult.edges.error) {
        throw new HTTPException(500, {
          message: 'Failed to send email',
          cause: sendResult.edges.error
        });
      }

      return c.json({
        success: true,
        messageId: sendResult.edges.success?.id,
        message: 'Email sent successfully'
      });
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error;
      }

      throw new HTTPException(500, {
        message: 'Failed to send email',
        cause: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Search emails
  app.get('/search', async (c) => {
    const searchQuerySchema = listEmailsQuerySchema.extend({
      from: z.string().optional(),
      to: z.string().optional(),
      subject: z.string().optional(),
      after: z.string().optional(), // Date in YYYY/MM/DD format
      before: z.string().optional()
    });

    const query = c.req.query();
    const parseResult = searchQuerySchema.safeParse(query);

    if (!parseResult.success) {
      throw new HTTPException(400, {
        message: 'Invalid query parameters',
        cause: parseResult.error.errors
      });
    }

    const { email, from, to, subject, after, before, ...listConfig } = parseResult.data;

    // Build Gmail search query
    const searchParts: string[] = [];
    if (from) searchParts.push(`from:${from}`);
    if (to) searchParts.push(`to:${to}`);
    if (subject) searchParts.push(`subject:${subject}`);
    if (after) searchParts.push(`after:${after}`);
    if (before) searchParts.push(`before:${before}`);
    if (listConfig.query) searchParts.push(listConfig.query);

    const searchQuery = searchParts.join(' ');

    try {
      const results = await executor.executeNodeChain(
        ['googleConnect', 'searchEmails'],
        {
          config: { 
            email,
            ...listConfig,
            query: searchQuery
          }
        }
      );

      const searchResult = results[1];
      if (searchResult.edges.error) {
        throw new HTTPException(500, {
          message: 'Failed to search emails',
          cause: searchResult.edges.error
        });
      }

      const emailData = searchResult.edges.success || { emails: [] };

      return c.json({
        emails: emailData.emails || [],
        total: emailData.emails?.length || 0,
        query: searchQuery,
        nextPageToken: emailData.nextPageToken || null
      });
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error;
      }

      throw new HTTPException(500, {
        message: 'Failed to search emails',
        cause: error instanceof Error ? error.message : String(error)
      });
    }
  });

  return app;
}