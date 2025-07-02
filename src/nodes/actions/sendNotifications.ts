import { Node, NodeMetadata, SimpleEdgeMap } from '../../core/types/node';
import { ExecutionContext } from '../../core/types/context';

export class SendNotificationsNode implements Node {
  metadata: NodeMetadata = {
    name: 'sendNotifications',
    description: 'Send notifications via various channels (email, webhook, etc.)',
    type: 'action',
    ai_hints: {
      purpose: 'Notification dispatch to external systems',
      when_to_use: 'When you need to notify users or systems about workflow events',
      expected_edges: ['success', 'error', 'partial']
    }
  };
  
  async execute(context: ExecutionContext): Promise<SimpleEdgeMap> {
    const { 
      recipients = [],
      channel = 'webhook',
      subject,
      message,
      template,
      data = {},
      priority = 'normal',
      retryOnFailure = true,
      batchSize = 10
    } = context.config || {};
    
    try {
      if (recipients.length === 0) {
        throw new Error('No recipients specified');
      }
      
      const notifications: any[] = [];
      const failures: any[] = [];
      
      // Process recipients in batches
      for (let i = 0; i < recipients.length; i += batchSize) {
        const batch = recipients.slice(i, i + batchSize);
        
        for (const recipient of batch) {
          try {
            const notification = await sendNotification({
              recipient,
              channel,
              subject,
              message: resolveMessage(message, template, data, context.state),
              priority,
              metadata: {
                workflowId: context.runtime?.workflowId,
                executionId: context.runtime?.executionId,
                timestamp: new Date().toISOString()
              }
            });
            
            notifications.push({
              recipient,
              status: 'sent',
              notificationId: notification.id,
              timestamp: new Date().toISOString()
            });
          } catch (error) {
            const failure = {
              recipient,
              status: 'failed',
              error: error instanceof Error ? error.message : 'Unknown error',
              timestamp: new Date().toISOString()
            };
            
            if (retryOnFailure) {
              // Add to retry queue
              const retries = context.state.get('notifications.retryQueue') || [];
              retries.push({
                ...failure,
                retryCount: 0,
                maxRetries: 3
              });
              context.state.set('notifications.retryQueue', retries);
            }
            
            failures.push(failure);
          }
        }
        
        // Small delay between batches to avoid overwhelming the service
        if (i + batchSize < recipients.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      // Store notification history
      const history = context.state.get('notifications.history') || [];
      history.push({
        timestamp: new Date().toISOString(),
        sent: notifications.length,
        failed: failures.length,
        channel,
        subject
      });
      context.state.set('notifications.history', history);
      
      // Determine edge based on results
      if (failures.length === 0) {
        return {
          success: () => ({
            sent: notifications.length,
            notifications,
            channel,
            timestamp: new Date().toISOString()
          })
        };
      } else if (notifications.length > 0) {
        return {
          partial: () => ({
            sent: notifications.length,
            failed: failures.length,
            notifications,
            failures,
            channel,
            timestamp: new Date().toISOString()
          })
        };
      } else {
        return {
          error: () => ({
            error: 'All notifications failed',
            failures,
            channel
          })
        };
      }
    } catch (error) {
      return {
        error: () => ({
          error: error instanceof Error ? error.message : 'Unknown error',
          channel,
          recipientCount: recipients.length
        })
      };
    }
  }
}

async function sendNotification(options: any): Promise<{ id: string }> {
  const { recipient, channel, subject, message, priority, metadata } = options;
  
  switch (channel) {
    case 'webhook':
      // Simulate webhook notification
      const webhookResponse = await fetch(recipient, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Priority': priority
        },
        body: JSON.stringify({
          subject,
          message,
          metadata
        })
      });
      
      if (!webhookResponse.ok) {
        throw new Error(`Webhook failed: ${webhookResponse.status}`);
      }
      
      return { id: `webhook-${Date.now()}-${Math.random().toString(36).substr(2, 9)}` };
      
    case 'email':
      // Simulate email notification (in real implementation, use email service)
      console.log(`Email to ${recipient}: ${subject}`);
      return { id: `email-${Date.now()}-${Math.random().toString(36).substr(2, 9)}` };
      
    case 'slack':
      // Simulate Slack notification
      console.log(`Slack message to ${recipient}: ${message}`);
      return { id: `slack-${Date.now()}-${Math.random().toString(36).substr(2, 9)}` };
      
    case 'sms':
      // Simulate SMS notification
      console.log(`SMS to ${recipient}: ${message}`);
      return { id: `sms-${Date.now()}-${Math.random().toString(36).substr(2, 9)}` };
      
    default:
      throw new Error(`Unknown notification channel: ${channel}`);
  }
}

function resolveMessage(
  message: string | undefined, 
  template: any | undefined, 
  data: any, 
  state: any
): string {
  if (message) {
    // Simple template replacement
    let resolved = message;
    
    // Replace {{key}} with values from data
    Object.entries(data).forEach(([key, value]) => {
      resolved = resolved.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
    });
    
    // Replace {{state.path}} with values from state
    const stateMatches = resolved.match(/{{state\.([^}]+)}}/g);
    if (stateMatches) {
      stateMatches.forEach(match => {
        const path = match.replace('{{state.', '').replace('}}', '');
        const value = state.get(path);
        resolved = resolved.replace(match, String(value || ''));
      });
    }
    
    return resolved;
  }
  
  if (template) {
    // Use template to build message
    return JSON.stringify(template);
  }
  
  return 'Notification from workflow';
}

// Export the node instance for direct use
export const sendNotifications = new SendNotificationsNode();