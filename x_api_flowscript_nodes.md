# Essential FlowScript Nodes for X Platform Integration

## Overview
This document outlines essential FlowScript nodes for interacting with the X (Twitter) platform using the X API v2. These nodes follow the FlowScript specification and provide comprehensive coverage of X API functionality including posts, users, lists, spaces, direct messages, and media operations.

## Core Authentication Nodes

### `xAuth`
**Purpose**: Handle X API authentication (OAuth 2.0 and Bearer Token)
```typescript
{
  metadata: {
    name: "xAuth",
    description: "Authenticate with X API using OAuth 2.0 or Bearer Token",
    type: "action",
    ai_hints: {
      purpose: "X API authentication and token management",
      when_to_use: "At the start of any X API workflow to establish authentication",
      expected_edges: ["authenticated", "auth_failed", "token_expired"]
    }
  },
  config: {
    authType: "bearer" | "oauth2", // Bearer token or OAuth 2.0
    credentials: {
      bearerToken?: string,
      apiKey?: string,
      apiSecret?: string,
      accessToken?: string,
      accessTokenSecret?: string
    }
  }
}
```

### `xRefreshToken`
**Purpose**: Refresh OAuth 2.0 access tokens
```typescript
{
  metadata: {
    name: "xRefreshToken",
    description: "Refresh expired OAuth 2.0 access token",
    type: "action",
    ai_hints: {
      purpose: "Token refresh for continuous API access",
      when_to_use: "When access token expires during long-running workflows",
      expected_edges: ["token_refreshed", "refresh_failed", "invalid_refresh_token"]
    }
  }
}
```

## Post Management Nodes

### `xCreatePost`
**Purpose**: Create new posts (tweets)
```typescript
{
  metadata: {
    name: "xCreatePost",
    description: "Create a new post on X platform",
    type: "action",
    ai_hints: {
      purpose: "Publish content to X",
      when_to_use: "When creating original posts, replies, or quote tweets",
      expected_edges: ["post_created", "content_error", "rate_limited", "auth_error"]
    }
  },
  config: {
    text?: string,
    mediaIds?: string[],
    poll?: {
      options: string[],
      durationMinutes: number
    },
    replySettings?: "everyone" | "mentionedUsers" | "following",
    inReplyToTweetId?: string,
    quoteTweetId?: string
  }
}
```

### `xDeletePost`
**Purpose**: Delete posts
```typescript
{
  metadata: {
    name: "xDeletePost",
    description: "Delete a post by ID",
    type: "action",
    ai_hints: {
      purpose: "Remove posts from X",
      when_to_use: "When posts need to be removed due to errors or content issues",
      expected_edges: ["post_deleted", "post_not_found", "delete_error", "auth_error"]
    }
  },
  config: {
    postId: string
  }
}
```

### `xGetPost`
**Purpose**: Retrieve individual posts
```typescript
{
  metadata: {
    name: "xGetPost",
    description: "Retrieve a specific post by ID",
    type: "action",
    ai_hints: {
      purpose: "Fetch detailed post information",
      when_to_use: "When analyzing specific posts or getting current metrics",
      expected_edges: ["post_found", "post_not_found", "private_post", "error"]
    }
  },
  config: {
    postId: string,
    expansions?: string[],
    postFields?: string[],
    userFields?: string[],
    mediaFields?: string[]
  }
}
```

### `xSearchPosts`
**Purpose**: Search for posts using queries
```typescript
{
  metadata: {
    name: "xSearchPosts",
    description: "Search for posts using X search operators",
    type: "action",
    ai_hints: {
      purpose: "Find posts matching specific criteria",
      when_to_use: "For content discovery, monitoring, or research",
      expected_edges: ["posts_found", "no_results", "query_error", "rate_limited"]
    }
  },
  config: {
    query: string,
    maxResults?: number,
    startTime?: string,
    endTime?: string,
    sortOrder?: "recency" | "relevancy",
    expansions?: string[],
    postFields?: string[],
    userFields?: string[]
  }
}
```

## User Management Nodes

### `xGetUser`
**Purpose**: Retrieve user information
```typescript
{
  metadata: {
    name: "xGetUser",
    description: "Get user information by ID or username",
    type: "action",
    ai_hints: {
      purpose: "Fetch user profile data and metrics",
      when_to_use: "When analyzing users or building user-centric features",
      expected_edges: ["user_found", "user_not_found", "private_user", "suspended_user"]
    }
  },
  config: {
    userId?: string,
    username?: string,
    userFields?: string[],
    expansions?: string[]
  }
}
```

### `xGetUserPosts`
**Purpose**: Get posts from a specific user's timeline
```typescript
{
  metadata: {
    name: "xGetUserPosts",
    description: "Retrieve posts from a user's timeline",
    type: "action",
    ai_hints: {
      purpose: "Analyze user's posting behavior and content",
      when_to_use: "For user analysis, content curation, or monitoring",
      expected_edges: ["posts_retrieved", "no_posts", "private_account", "user_not_found"]
    }
  },
  config: {
    userId: string,
    maxResults?: number,
    startTime?: string,
    endTime?: string,
    excludeReplies?: boolean,
    excludeRetweets?: boolean,
    expansions?: string[],
    postFields?: string[]
  }
}
```

### `xGetUserMentions`
**Purpose**: Get mentions for a specific user
```typescript
{
  metadata: {
    name: "xGetUserMentions",
    description: "Retrieve posts mentioning a specific user",
    type: "action",
    ai_hints: {
      purpose: "Monitor mentions and engagement for users",
      when_to_use: "For reputation monitoring or engagement tracking",
      expected_edges: ["mentions_found", "no_mentions", "private_account", "error"]
    }
  },
  config: {
    userId: string,
    maxResults?: number,
    startTime?: string,
    endTime?: string,
    expansions?: string[],
    postFields?: string[]
  }
}
```

### `xFollowUser`
**Purpose**: Follow a user
```typescript
{
  metadata: {
    name: "xFollowUser",
    description: "Follow a user on X",
    type: "action",
    ai_hints: {
      purpose: "Build social connections and networks",
      when_to_use: "For automated follow strategies or relationship building",
      expected_edges: ["followed", "already_following", "user_not_found", "follow_limit"]
    }
  },
  config: {
    targetUserId: string
  }
}
```

### `xUnfollowUser`
**Purpose**: Unfollow a user
```typescript
{
  metadata: {
    name: "xUnfollowUser",
    description: "Unfollow a user on X",
    type: "action",
    ai_hints: {
      purpose: "Manage following relationships",
      when_to_use: "For account cleanup or relationship management",
      expected_edges: ["unfollowed", "not_following", "user_not_found", "error"]
    }
  },
  config: {
    targetUserId: string
  }
}
```

## Engagement Nodes

### `xLikePost`
**Purpose**: Like a post
```typescript
{
  metadata: {
    name: "xLikePost",
    description: "Like a post on X",
    type: "action",
    ai_hints: {
      purpose: "Engage with content through likes",
      when_to_use: "For automated engagement or content appreciation",
      expected_edges: ["liked", "already_liked", "post_not_found", "rate_limited"]
    }
  },
  config: {
    postId: string
  }
}
```

### `xUnlikePost`
**Purpose**: Unlike a previously liked post
```typescript
{
  metadata: {
    name: "xUnlikePost",
    description: "Remove like from a post",
    type: "action",
    ai_hints: {
      purpose: "Manage engagement history",
      when_to_use: "For correcting accidental likes or engagement cleanup",
      expected_edges: ["unliked", "not_liked", "post_not_found", "error"]
    }
  },
  config: {
    postId: string
  }
}
```

### `xRetweetPost`
**Purpose**: Retweet a post
```typescript
{
  metadata: {
    name: "xRetweetPost",
    description: "Retweet a post",
    type: "action",
    ai_hints: {
      purpose: "Share content with followers",
      when_to_use: "For content amplification and sharing",
      expected_edges: ["retweeted", "already_retweeted", "post_not_found", "rate_limited"]
    }
  },
  config: {
    postId: string
  }
}
```

### `xUnretweetPost`
**Purpose**: Remove a retweet
```typescript
{
  metadata: {
    name: "xUnretweetPost",
    description: "Remove a retweet",
    type: "action",
    ai_hints: {
      purpose: "Manage shared content",
      when_to_use: "For correcting accidental retweets or content management",
      expected_edges: ["unretweeted", "not_retweeted", "post_not_found", "error"]
    }
  },
  config: {
    postId: string
  }
}
```

## Media Management Nodes

### `xUploadMedia`
**Purpose**: Upload media files for use in posts
```typescript
{
  metadata: {
    name: "xUploadMedia",
    description: "Upload media (images, videos, GIFs) to X",
    type: "action",
    ai_hints: {
      purpose: "Prepare media for posting",
      when_to_use: "Before creating posts with media attachments",
      expected_edges: ["media_uploaded", "file_too_large", "invalid_format", "upload_error"]
    }
  },
  config: {
    mediaPath: string,
    mediaType: "image" | "video" | "gif",
    altText?: string
  }
}
```

## List Management Nodes

### `xCreateList`
**Purpose**: Create a new list
```typescript
{
  metadata: {
    name: "xCreateList",
    description: "Create a new X list",
    type: "action",
    ai_hints: {
      purpose: "Organize users into curated lists",
      when_to_use: "For content curation and user organization",
      expected_edges: ["list_created", "name_taken", "limit_reached", "error"]
    }
  },
  config: {
    name: string,
    description?: string,
    private?: boolean
  }
}
```

### `xAddToList`
**Purpose**: Add a user to a list
```typescript
{
  metadata: {
    name: "xAddToList",
    description: "Add a user to an existing list",
    type: "action",
    ai_hints: {
      purpose: "Manage list membership",
      when_to_use: "For building and maintaining curated user lists",
      expected_edges: ["user_added", "already_member", "list_not_found", "user_not_found"]
    }
  },
  config: {
    listId: string,
    userId: string
  }
}
```

### `xRemoveFromList`
**Purpose**: Remove a user from a list
```typescript
{
  metadata: {
    name: "xRemoveFromList",
    description: "Remove a user from a list",
    type: "action",
    ai_hints: {
      purpose: "Manage list membership",
      when_to_use: "For list cleanup and membership management",
      expected_edges: ["user_removed", "not_member", "list_not_found", "error"]
    }
  },
  config: {
    listId: string,
    userId: string
  }
}
```

## Direct Message Nodes

### `xSendDirectMessage`
**Purpose**: Send direct messages
```typescript
{
  metadata: {
    name: "xSendDirectMessage",
    description: "Send a direct message to a user",
    type: "action",
    ai_hints: {
      purpose: "Private communication with users",
      when_to_use: "For customer support, notifications, or private conversations",
      expected_edges: ["message_sent", "recipient_not_found", "dm_disabled", "rate_limited"]
    }
  },
  config: {
    recipientId: string,
    text?: string,
    mediaId?: string
  }
}
```

## Spaces Nodes

### `xCreateSpace`
**Purpose**: Create a new Space
```typescript
{
  metadata: {
    name: "xCreateSpace",
    description: "Create a new X Space for live audio conversation",
    type: "action",
    ai_hints: {
      purpose: "Host live audio conversations",
      when_to_use: "For creating live events and discussions",
      expected_edges: ["space_created", "creation_error", "auth_error"]
    }
  },
  config: {
    title: string,
    scheduledStart?: string
  }
}
```

### `xGetSpace`
**Purpose**: Get information about a Space
```typescript
{
  metadata: {
    name: "xGetSpace",
    description: "Retrieve information about a specific Space",
    type: "action",
    ai_hints: {
      purpose: "Monitor and analyze Spaces",
      when_to_use: "For Space discovery and analysis",
      expected_edges: ["space_found", "space_not_found", "space_ended", "error"]
    }
  },
  config: {
    spaceId: string,
    expansions?: string[],
    spaceFields?: string[]
  }
}
```

## Analytics and Monitoring Nodes

### `xGetPostMetrics`
**Purpose**: Get detailed metrics for posts
```typescript
{
  metadata: {
    name: "xGetPostMetrics",
    description: "Retrieve engagement metrics for posts",
    type: "action",
    ai_hints: {
      purpose: "Analyze post performance and engagement",
      when_to_use: "For analytics and performance tracking",
      expected_edges: ["metrics_retrieved", "post_not_found", "insufficient_access", "error"]
    }
  },
  config: {
    postIds: string[],
    metricTypes: ("public" | "organic" | "promoted")[]
  }
}
```

### `xStreamPosts`
**Purpose**: Real-time post streaming
```typescript
{
  metadata: {
    name: "xStreamPosts",
    description: "Stream posts in real-time based on rules",
    type: "action",
    ai_hints: {
      purpose: "Real-time monitoring and data collection",
      when_to_use: "For live monitoring, alerts, and real-time analysis",
      expected_edges: ["stream_started", "stream_error", "rule_limit", "auth_error"]
    }
  },
  config: {
    rules: Array<{
      value: string,
      tag?: string
    }>,
    expansions?: string[],
    postFields?: string[]
  }
}
```

## Utility and Helper Nodes

### `xRateLimitCheck`
**Purpose**: Check current rate limit status
```typescript
{
  metadata: {
    name: "xRateLimitCheck",
    description: "Check rate limit status for X API endpoints",
    type: "action",
    ai_hints: {
      purpose: "Prevent rate limit violations",
      when_to_use: "Before making API calls in high-volume workflows",
      expected_edges: ["within_limits", "approaching_limit", "rate_limited", "error"]
    }
  },
  config: {
    endpoint: string
  }
}
```

### `xWaitForRateLimit`
**Purpose**: Wait for rate limit reset
```typescript
{
  metadata: {
    name: "xWaitForRateLimit",
    description: "Wait until rate limit resets",
    type: "action",
    ai_hints: {
      purpose: "Handle rate limiting gracefully",
      when_to_use: "When rate limits are hit and workflow should continue",
      expected_edges: ["limit_reset", "timeout", "error"]
    }
  },
  config: {
    maxWaitSeconds?: number
  }
}
```

### `xValidateCredentials`
**Purpose**: Validate API credentials
```typescript
{
  metadata: {
    name: "xValidateCredentials",
    description: "Validate X API credentials and permissions",
    type: "action",
    ai_hints: {
      purpose: "Ensure valid authentication before API operations",
      when_to_use: "At workflow start or after credential updates",
      expected_edges: ["credentials_valid", "credentials_invalid", "insufficient_permissions"]
    }
  }
}
```

## Content Analysis Nodes

### `xAnalyzePost`
**Purpose**: Analyze post content and context
```typescript
{
  metadata: {
    name: "xAnalyzePost",
    description: "Analyze post for sentiment, entities, and context annotations",
    type: "action",
    ai_hints: {
      purpose: "Extract insights from post content",
      when_to_use: "For content analysis, moderation, or classification",
      expected_edges: ["analysis_complete", "content_flagged", "analysis_error"]
    }
  },
  config: {
    postId: string,
    analysisTypes: ("sentiment" | "entities" | "context" | "language")[]
  }
}
```

### `xContentModerator`
**Purpose**: Content moderation and filtering
```typescript
{
  metadata: {
    name: "xContentModerator",
    description: "Moderate content based on rules and policies",
    type: "action",
    ai_hints: {
      purpose: "Automated content moderation",
      when_to_use: "Before posting content or when processing user-generated content",
      expected_edges: ["content_approved", "content_flagged", "content_blocked", "error"]
    }
  },
  config: {
    content: string,
    rules: Array<{
      type: string,
      threshold: number
    }>
  }
}
```

## Error Handling and Retry Nodes

### `xRetryHandler`
**Purpose**: Handle API errors and retry logic
```typescript
{
  metadata: {
    name: "xRetryHandler",
    description: "Handle X API errors with exponential backoff retry",
    type: "control",
    ai_hints: {
      purpose: "Resilient API error handling",
      when_to_use: "Wrapping X API calls that may fail due to temporary issues",
      expected_edges: ["retry", "max_retries_exceeded", "permanent_error", "success"]
    }
  },
  config: {
    maxRetries: number,
    backoffMultiplier: number,
    retryableErrors: string[]
  }
}
```

## Configuration and Setup

### Required Environment Variables
```typescript
{
  X_API_BEARER_TOKEN: string,
  X_API_KEY?: string,
  X_API_SECRET?: string,
  X_ACCESS_TOKEN?: string,
  X_ACCESS_TOKEN_SECRET?: string,
  X_WEBHOOK_SECRET?: string
}
```

### Common Configuration Patterns
```typescript
// Basic authentication setup
{
  "nodes": [
    { "xAuth": { "authType": "bearer", "credentials": { "bearerToken": "$env.X_API_BEARER_TOKEN" } } },
    { "xValidateCredentials": {} },
    // ... rest of workflow
  ]
}

// Rate limit aware posting
{
  "nodes": [
    "xRateLimitCheck",
    [
      "rateLimitStatus",
      {
        "within_limits": { "xCreatePost": { "text": "Hello, X!" } },
        "rate_limited": [
          { "xWaitForRateLimit": { "maxWaitSeconds": 900 } },
          { "xCreatePost": { "text": "Hello, X!" } }
        ]
      }
    ]
  ]
}
```

## Access Level Requirements

### Free Tier (500 Posts/month)
- Basic post operations
- User lookups
- Limited search

### Basic Tier ($200/month)
- Increased rate limits
- More comprehensive search
- User timeline access

### Pro Tier ($5,000/month)
- Full search capabilities
- Filtered stream access
- Advanced analytics

### Enterprise Tier (Custom pricing)
- Full historical search
- Complete streaming API
- Premium support

## Best Practices

1. **Always check rate limits** before making API calls
2. **Use bearer token authentication** for read-only operations
3. **Implement exponential backoff** for retry logic
4. **Cache user data** to reduce API calls
5. **Use expansions** to get related data in single requests
6. **Monitor post caps** to avoid monthly limits
7. **Validate content** before posting to avoid policy violations

## Example Workflow: Automated Content Publishing
```json
{
  "id": "x-content-publisher",
  "initialState": {
    "posts": [],
    "published": 0,
    "failed": 0
  },
  "nodes": [
    { "xAuth": { "authType": "oauth2" } },
    "xValidateCredentials",
    [
      { "forEach": { "items": "state.contentQueue", "as": "post" } },
      [
        { "xContentModerator": { "content": "state.post.text" } },
        [
          "moderationResult",
          {
            "content_approved": [
              "xRateLimitCheck",
              [
                "rateLimitStatus",
                {
                  "within_limits": { "xCreatePost": { "text": "state.post.text" } },
                  "rate_limited": [
                    { "xWaitForRateLimit": {} },
                    { "xCreatePost": { "text": "state.post.text" } }
                  ]
                }
              ]
            ],
            "content_flagged": { "logContentFlag": { "content": "state.post" } }
          }
        ]
      ]
    ]
  ]
}
```

This comprehensive set of nodes provides full coverage of X API v2 functionality while following FlowScript conventions for maintainable, robust workflows.