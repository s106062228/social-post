const VERSION = "1.0.0";

export interface OpenAPISpec {
  openapi: string;
  info: {
    title: string;
    description: string;
    version: string;
    contact?: { email: string };
  };
  servers: { url: string; description: string }[];
  security: { bearerAuth: string[] }[];
  components: {
    securitySchemes: Record<string, unknown>;
    schemas: Record<string, unknown>;
  };
  paths: Record<string, unknown>;
  tags: { name: string; description: string }[];
}

const schemas: Record<string, unknown> = {
  Post: {
    type: "object",
    properties: {
      id: { type: "string" },
      content: { type: "string" },
      status: { type: "string", enum: ["DRAFT", "SCHEDULED", "PUBLISHING", "PUBLISHED", "PARTIALLY_PUBLISHED", "FAILED"] },
      mediaType: { type: "string", enum: ["NONE", "IMAGE", "VIDEO", "CAROUSEL"] },
      mediaUrls: { type: "array", items: { type: "string" } },
      scheduledAt: { type: "string", format: "date-time", nullable: true },
      language: { type: "string", nullable: true },
      starred: { type: "boolean" },
      isEvergreen: { type: "boolean" },
      archivedAt: { type: "string", format: "date-time", nullable: true },
      createdAt: { type: "string", format: "date-time" },
      updatedAt: { type: "string", format: "date-time" },
    },
  },
  Template: {
    type: "object",
    properties: {
      id: { type: "string" },
      name: { type: "string" },
      content: { type: "string" },
      mediaType: { type: "string", enum: ["NONE", "IMAGE", "VIDEO", "CAROUSEL"] },
      mediaUrls: { type: "array", items: { type: "string" } },
      createdAt: { type: "string", format: "date-time" },
    },
  },
  Tag: {
    type: "object",
    properties: {
      id: { type: "string" },
      name: { type: "string" },
      color: { type: "string" },
    },
  },
  Campaign: {
    type: "object",
    properties: {
      id: { type: "string" },
      name: { type: "string" },
      description: { type: "string", nullable: true },
      goal: { type: "string", nullable: true },
      startDate: { type: "string", format: "date-time", nullable: true },
      endDate: { type: "string", format: "date-time", nullable: true },
      isActive: { type: "boolean" },
      createdAt: { type: "string", format: "date-time" },
    },
  },
  SocialAccount: {
    type: "object",
    properties: {
      id: { type: "string" },
      platform: { type: "string" },
      platformAccountId: { type: "string" },
      accountName: { type: "string" },
      isActive: { type: "boolean" },
      tokenExpiresAt: { type: "string", format: "date-time", nullable: true },
      createdAt: { type: "string", format: "date-time" },
    },
  },
  Notification: {
    type: "object",
    properties: {
      id: { type: "string" },
      type: { type: "string" },
      title: { type: "string" },
      body: { type: "string" },
      read: { type: "boolean" },
      entityId: { type: "string", nullable: true },
      entityType: { type: "string", nullable: true },
      createdAt: { type: "string", format: "date-time" },
    },
  },
  ApiKey: {
    type: "object",
    properties: {
      id: { type: "string" },
      name: { type: "string" },
      prefix: { type: "string" },
      lastUsedAt: { type: "string", format: "date-time", nullable: true },
      expiresAt: { type: "string", format: "date-time", nullable: true },
      createdAt: { type: "string", format: "date-time" },
    },
  },
  Error: {
    type: "object",
    properties: {
      error: { type: "string" },
    },
    required: ["error"],
  },
  Pagination: {
    type: "object",
    properties: {
      page: { type: "integer" },
      limit: { type: "integer" },
      total: { type: "integer" },
    },
  },
};

const authSchemes = {
  bearerAuth: {
    type: "http",
    scheme: "bearer",
    bearerFormat: "JWT",
    description: "NextAuth.js session token (cookie-based) or API key via x-api-key header",
  },
  apiKeyAuth: {
    type: "apiKey",
    in: "header",
    name: "x-api-key",
    description: "Personal API key created in Settings → API Keys. Used for Zapier and external integrations.",
  },
};

function ref(name: string) {
  return { $ref: `#/components/schemas/${name}` };
}

function listResponse(itemSchema: unknown) {
  return {
    200: {
      description: "Success",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              items: { type: "array", items: itemSchema },
            },
          },
        },
      },
    },
    401: { description: "Unauthorized", content: { "application/json": { schema: ref("Error") } } },
    429: { description: "Rate limit exceeded", content: { "application/json": { schema: ref("Error") } } },
  };
}

function itemResponse(schema: unknown) {
  return {
    200: {
      description: "Success",
      content: { "application/json": { schema } },
    },
    401: { description: "Unauthorized", content: { "application/json": { schema: ref("Error") } } },
    404: { description: "Not found", content: { "application/json": { schema: ref("Error") } } },
  };
}

export function buildOpenAPISpec(baseUrl: string): OpenAPISpec {
  return {
    openapi: "3.0.3",
    info: {
      title: "PostFlow API",
      description:
        "REST API for PostFlow — social media scheduling and management platform. " +
        "Authenticate with a session cookie (browser) or an API key (external integrations). " +
        "All endpoints require authentication unless noted otherwise.",
      version: VERSION,
      contact: { email: "support@postflow.app" },
    },
    servers: [{ url: baseUrl, description: "PostFlow API server" }],
    security: [{ bearerAuth: [] }],
    tags: [
      { name: "Posts", description: "Create, schedule, and manage social media posts" },
      { name: "Templates", description: "Reusable content templates" },
      { name: "Tags", description: "Post tagging and categorization" },
      { name: "Campaigns", description: "Group posts into campaigns" },
      { name: "Accounts", description: "Connected social media accounts" },
      { name: "Analytics", description: "Performance metrics and analytics" },
      { name: "Notifications", description: "In-app notification center" },
      { name: "Schedules", description: "Recurring post schedules" },
      { name: "Queue", description: "Optimal posting queue slots" },
      { name: "Media", description: "Media asset library" },
      { name: "API Keys", description: "Personal API key management" },
      { name: "Settings", description: "User profile and preferences" },
      { name: "Health", description: "System health checks" },
      { name: "Zap", description: "Zapier-compatible polling endpoints (API key auth)" },
    ],
    components: {
      securitySchemes: authSchemes,
      schemas,
    },
    paths: {
      // Health
      "/api/health": {
        get: {
          tags: ["Health"],
          summary: "Health check",
          description: "Returns system health status. No authentication required.",
          security: [],
          responses: {
            200: {
              description: "Healthy",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      status: { type: "string", enum: ["ok", "degraded"] },
                      db: { type: "string", enum: ["ok", "error"] },
                      redis: { type: "string", enum: ["ok", "error"] },
                      version: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },

      // Posts
      "/api/posts": {
        get: {
          tags: ["Posts"],
          summary: "List posts",
          description: "Returns all posts for the authenticated user, with optional filtering.",
          parameters: [
            { name: "status", in: "query", schema: { type: "string", enum: ["DRAFT", "SCHEDULED", "PUBLISHING", "PUBLISHED", "PARTIALLY_PUBLISHED", "FAILED"] } },
            { name: "search", in: "query", schema: { type: "string" }, description: "Full-text search on post content" },
            { name: "tag", in: "query", schema: { type: "string" }, description: "Filter by tag ID" },
            { name: "platform", in: "query", schema: { type: "string" }, description: "Filter by publish platform" },
            { name: "sentiment", in: "query", schema: { type: "string", enum: ["POSITIVE", "NEUTRAL", "NEGATIVE"] } },
            { name: "starred", in: "query", schema: { type: "boolean" } },
            { name: "evergreen", in: "query", schema: { type: "boolean" } },
            { name: "archived", in: "query", schema: { type: "boolean" }, description: "When true, returns only archived posts" },
            { name: "from", in: "query", schema: { type: "string", format: "date-time" } },
            { name: "to", in: "query", schema: { type: "string", format: "date-time" } },
            { name: "page", in: "query", schema: { type: "integer", default: 1 } },
            { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
          ],
          responses: listResponse(ref("Post")),
        },
        post: {
          tags: ["Posts"],
          summary: "Create post",
          description: "Create a new post. Optionally schedule it with `scheduledAt`.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["content", "mediaType", "accountIds"],
                  properties: {
                    content: { type: "string" },
                    mediaType: { type: "string", enum: ["NONE", "IMAGE", "VIDEO", "CAROUSEL"] },
                    mediaUrls: { type: "array", items: { type: "string" } },
                    scheduledAt: { type: "string", format: "date-time", nullable: true },
                    accountIds: { type: "array", items: { type: "string" } },
                    tagIds: { type: "array", items: { type: "string" } },
                    firstComment: { type: "string", maxLength: 2200, nullable: true },
                    reminderMinutes: { type: "integer", nullable: true },
                    language: { type: "string", nullable: true },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: "Created", content: { "application/json": { schema: ref("Post") } } },
            400: { description: "Validation error", content: { "application/json": { schema: ref("Error") } } },
            401: { description: "Unauthorized", content: { "application/json": { schema: ref("Error") } } },
          },
        },
      },

      "/api/posts/{id}": {
        get: {
          tags: ["Posts"],
          summary: "Get post",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: itemResponse(ref("Post")),
        },
        patch: {
          tags: ["Posts"],
          summary: "Update post",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    content: { type: "string" },
                    mediaType: { type: "string", enum: ["NONE", "IMAGE", "VIDEO", "CAROUSEL"] },
                    mediaUrls: { type: "array", items: { type: "string" } },
                    scheduledAt: { type: "string", format: "date-time", nullable: true },
                    status: { type: "string", enum: ["DRAFT", "SCHEDULED"] },
                  },
                },
              },
            },
          },
          responses: itemResponse(ref("Post")),
        },
        delete: {
          tags: ["Posts"],
          summary: "Delete post",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            204: { description: "Deleted" },
            401: { description: "Unauthorized", content: { "application/json": { schema: ref("Error") } } },
            404: { description: "Not found", content: { "application/json": { schema: ref("Error") } } },
          },
        },
      },

      "/api/posts/{id}/retry": {
        post: {
          tags: ["Posts"],
          summary: "Retry failed post",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: itemResponse(ref("Post")),
        },
      },

      "/api/posts/{id}/duplicate": {
        post: {
          tags: ["Posts"],
          summary: "Duplicate post",
          description: "Creates a DRAFT copy of the post.",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            201: { description: "Created duplicate", content: { "application/json": { schema: ref("Post") } } },
            401: { description: "Unauthorized", content: { "application/json": { schema: ref("Error") } } },
          },
        },
      },

      "/api/posts/{id}/archive": {
        patch: {
          tags: ["Posts"],
          summary: "Toggle archive state",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            200: {
              description: "Archive toggled",
              content: { "application/json": { schema: { type: "object", properties: { archivedAt: { type: "string", nullable: true } } } } },
            },
            401: { description: "Unauthorized", content: { "application/json": { schema: ref("Error") } } },
          },
        },
      },

      "/api/posts/{id}/star": {
        patch: {
          tags: ["Posts"],
          summary: "Toggle starred status",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            200: {
              description: "Star toggled",
              content: { "application/json": { schema: { type: "object", properties: { starred: { type: "boolean" } } } } },
            },
            401: { description: "Unauthorized", content: { "application/json": { schema: ref("Error") } } },
          },
        },
      },

      "/api/posts/{id}/evergreen": {
        patch: {
          tags: ["Posts"],
          summary: "Toggle evergreen flag",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            200: {
              description: "Evergreen toggled",
              content: { "application/json": { schema: { type: "object", properties: { isEvergreen: { type: "boolean" } } } } },
            },
            401: { description: "Unauthorized", content: { "application/json": { schema: ref("Error") } } },
          },
        },
      },

      "/api/posts/{id}/recycle": {
        post: {
          tags: ["Posts"],
          summary: "Recycle published post",
          description: "Creates a new DRAFT from a PUBLISHED post.",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            content: {
              "application/json": {
                schema: { type: "object", properties: { scheduledAt: { type: "string", format: "date-time", nullable: true } } },
              },
            },
          },
          responses: {
            201: { description: "Created recycled draft", content: { "application/json": { schema: ref("Post") } } },
            401: { description: "Unauthorized", content: { "application/json": { schema: ref("Error") } } },
          },
        },
      },

      "/api/posts/{id}/insights": {
        get: {
          tags: ["Posts"],
          summary: "Get post insights",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            200: {
              description: "Insights data",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      platforms: { type: "array" },
                      totals: { type: "object", properties: { impressions: { type: "integer" }, reach: { type: "integer" }, likes: { type: "integer" }, comments: { type: "integer" }, shares: { type: "integer" } } },
                    },
                  },
                },
              },
            },
            401: { description: "Unauthorized", content: { "application/json": { schema: ref("Error") } } },
          },
        },
      },

      "/api/posts/bulk": {
        delete: {
          tags: ["Posts"],
          summary: "Bulk delete posts",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object", required: ["ids"], properties: { ids: { type: "array", items: { type: "string" } } } } } },
          },
          responses: {
            200: { description: "Deleted count", content: { "application/json": { schema: { type: "object", properties: { deleted: { type: "integer" } } } } } },
            401: { description: "Unauthorized", content: { "application/json": { schema: ref("Error") } } },
          },
        },
      },

      "/api/posts/export": {
        get: {
          tags: ["Posts"],
          summary: "Export posts as CSV",
          description: "Streams all user posts as a downloadable CSV file.",
          parameters: [
            { name: "status", in: "query", schema: { type: "string" } },
            { name: "search", in: "query", schema: { type: "string" } },
          ],
          responses: {
            200: { description: "CSV file", content: { "text/csv": {} } },
            401: { description: "Unauthorized", content: { "application/json": { schema: ref("Error") } } },
          },
        },
      },

      // Templates
      "/api/templates": {
        get: {
          tags: ["Templates"],
          summary: "List templates",
          responses: listResponse(ref("Template")),
        },
        post: {
          tags: ["Templates"],
          summary: "Create template",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { type: "object", required: ["name", "content", "mediaType"], properties: { name: { type: "string" }, content: { type: "string" }, mediaType: { type: "string" }, mediaUrls: { type: "array", items: { type: "string" } } } },
              },
            },
          },
          responses: {
            201: { description: "Created", content: { "application/json": { schema: ref("Template") } } },
            401: { description: "Unauthorized", content: { "application/json": { schema: ref("Error") } } },
          },
        },
      },

      "/api/templates/{id}": {
        delete: {
          tags: ["Templates"],
          summary: "Delete template",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            204: { description: "Deleted" },
            401: { description: "Unauthorized", content: { "application/json": { schema: ref("Error") } } },
          },
        },
      },

      // Tags
      "/api/tags": {
        get: {
          tags: ["Tags"],
          summary: "List tags",
          responses: listResponse(ref("Tag")),
        },
        post: {
          tags: ["Tags"],
          summary: "Create tag",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object", required: ["name"], properties: { name: { type: "string" }, color: { type: "string" } } } } },
          },
          responses: {
            201: { description: "Created", content: { "application/json": { schema: ref("Tag") } } },
            401: { description: "Unauthorized", content: { "application/json": { schema: ref("Error") } } },
          },
        },
      },

      "/api/tags/{id}": {
        delete: {
          tags: ["Tags"],
          summary: "Delete tag",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            204: { description: "Deleted" },
            401: { description: "Unauthorized", content: { "application/json": { schema: ref("Error") } } },
          },
        },
      },

      // Campaigns
      "/api/campaigns": {
        get: {
          tags: ["Campaigns"],
          summary: "List campaigns",
          responses: listResponse(ref("Campaign")),
        },
        post: {
          tags: ["Campaigns"],
          summary: "Create campaign",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["name"],
                  properties: { name: { type: "string" }, description: { type: "string" }, goal: { type: "string" }, startDate: { type: "string", format: "date-time" }, endDate: { type: "string", format: "date-time" } },
                },
              },
            },
          },
          responses: {
            201: { description: "Created", content: { "application/json": { schema: ref("Campaign") } } },
            401: { description: "Unauthorized", content: { "application/json": { schema: ref("Error") } } },
          },
        },
      },

      "/api/campaigns/{id}": {
        get: {
          tags: ["Campaigns"],
          summary: "Get campaign",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: itemResponse(ref("Campaign")),
        },
        patch: {
          tags: ["Campaigns"],
          summary: "Update campaign",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            content: { "application/json": { schema: { type: "object", properties: { name: { type: "string" }, description: { type: "string" }, isActive: { type: "boolean" } } } } },
          },
          responses: itemResponse(ref("Campaign")),
        },
        delete: {
          tags: ["Campaigns"],
          summary: "Delete campaign",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            204: { description: "Deleted" },
            401: { description: "Unauthorized", content: { "application/json": { schema: ref("Error") } } },
          },
        },
      },

      // Accounts
      "/api/accounts/{id}": {
        delete: {
          tags: ["Accounts"],
          summary: "Disconnect social account",
          description: "Soft-disconnects account by setting isActive=false.",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            204: { description: "Disconnected" },
            401: { description: "Unauthorized", content: { "application/json": { schema: ref("Error") } } },
          },
        },
      },

      "/api/accounts/{id}/check": {
        post: {
          tags: ["Accounts"],
          summary: "Check account token validity",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            200: { description: "Token status", content: { "application/json": { schema: { type: "object", properties: { valid: { type: "boolean" } } } } } },
            401: { description: "Unauthorized", content: { "application/json": { schema: ref("Error") } } },
          },
        },
      },

      // Analytics
      "/api/analytics/summary": {
        get: {
          tags: ["Analytics"],
          summary: "Analytics summary",
          description: "Returns post counts by status, platform breakdown, success rate, and daily activity.",
          responses: {
            200: { description: "Summary data", content: { "application/json": { schema: { type: "object" } } } },
            401: { description: "Unauthorized", content: { "application/json": { schema: ref("Error") } } },
          },
        },
      },

      "/api/analytics/dashboard": {
        get: {
          tags: ["Analytics"],
          summary: "Analytics dashboard data",
          parameters: [{ name: "period", in: "query", schema: { type: "string", enum: ["7d", "30d", "90d"], default: "30d" } }],
          responses: {
            200: { description: "Dashboard data including time-series, platform distribution, hourly heatmap", content: { "application/json": { schema: { type: "object" } } } },
            401: { description: "Unauthorized", content: { "application/json": { schema: ref("Error") } } },
          },
        },
      },

      "/api/analytics/leaderboard": {
        get: {
          tags: ["Analytics"],
          summary: "Content performance leaderboard",
          parameters: [
            { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
            { name: "period", in: "query", schema: { type: "string", enum: ["7d", "30d", "90d", "all"], default: "30d" } },
          ],
          responses: {
            200: { description: "Top posts ranked by engagement score", content: { "application/json": { schema: { type: "object" } } } },
            401: { description: "Unauthorized", content: { "application/json": { schema: ref("Error") } } },
          },
        },
      },

      "/api/analytics/best-times": {
        get: {
          tags: ["Analytics"],
          summary: "Best times to post",
          parameters: [{ name: "platform", in: "query", schema: { type: "string" }, description: "Optional platform filter" }],
          responses: {
            200: { description: "Ranked posting time slots by engagement", content: { "application/json": { schema: { type: "object" } } } },
            401: { description: "Unauthorized", content: { "application/json": { schema: ref("Error") } } },
          },
        },
      },

      // Notifications
      "/api/notifications": {
        get: {
          tags: ["Notifications"],
          summary: "List notifications",
          parameters: [{ name: "limit", in: "query", schema: { type: "integer", default: 20 } }],
          responses: {
            200: { description: "Notifications list", content: { "application/json": { schema: { type: "object", properties: { notifications: { type: "array", items: ref("Notification") }, unreadCount: { type: "integer" } } } } } },
            401: { description: "Unauthorized", content: { "application/json": { schema: ref("Error") } } },
          },
        },
      },

      "/api/notifications/{id}/read": {
        post: {
          tags: ["Notifications"],
          summary: "Mark notification as read",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            200: { description: "Marked as read" },
            401: { description: "Unauthorized", content: { "application/json": { schema: ref("Error") } } },
          },
        },
      },

      "/api/notifications/read-all": {
        post: {
          tags: ["Notifications"],
          summary: "Mark all notifications as read",
          responses: {
            200: { description: "All marked as read" },
            401: { description: "Unauthorized", content: { "application/json": { schema: ref("Error") } } },
          },
        },
      },

      // Schedules
      "/api/schedules": {
        get: {
          tags: ["Schedules"],
          summary: "List recurring schedules",
          responses: {
            200: { description: "Schedules list", content: { "application/json": { schema: { type: "object" } } } },
            401: { description: "Unauthorized", content: { "application/json": { schema: ref("Error") } } },
          },
        },
        post: {
          tags: ["Schedules"],
          summary: "Create recurring schedule",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["name", "content", "mediaType", "platforms", "cronExpr", "timezone"],
                  properties: {
                    name: { type: "string" },
                    content: { type: "string" },
                    mediaType: { type: "string" },
                    platforms: { type: "array", items: { type: "string" } },
                    cronExpr: { type: "string", description: "Cron expression, e.g. '0 9 * * 1'" },
                    timezone: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: "Created" },
            401: { description: "Unauthorized", content: { "application/json": { schema: ref("Error") } } },
          },
        },
      },

      // Queue slots
      "/api/queue-slots": {
        get: {
          tags: ["Queue"],
          summary: "List queue slots",
          responses: {
            200: { description: "Queue slots list", content: { "application/json": { schema: { type: "object" } } } },
            401: { description: "Unauthorized", content: { "application/json": { schema: ref("Error") } } },
          },
        },
        post: {
          tags: ["Queue"],
          summary: "Create queue slot",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["label", "hour", "minute", "daysOfWeek"],
                  properties: {
                    label: { type: "string" },
                    platform: { type: "string", nullable: true },
                    hour: { type: "integer", minimum: 0, maximum: 23 },
                    minute: { type: "integer", minimum: 0, maximum: 59 },
                    daysOfWeek: { type: "array", items: { type: "integer", minimum: 0, maximum: 6 } },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: "Created" },
            401: { description: "Unauthorized", content: { "application/json": { schema: ref("Error") } } },
          },
        },
      },

      "/api/posts/{id}/queue": {
        post: {
          tags: ["Queue"],
          summary: "Add post to queue",
          description: "Assigns a DRAFT post to the next available queue slot.",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            200: { description: "Post scheduled", content: { "application/json": { schema: ref("Post") } } },
            401: { description: "Unauthorized", content: { "application/json": { schema: ref("Error") } } },
          },
        },
      },

      // Media
      "/api/media": {
        get: {
          tags: ["Media"],
          summary: "List media assets",
          parameters: [
            { name: "page", in: "query", schema: { type: "integer", default: 1 } },
            { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
          ],
          responses: {
            200: { description: "Media assets list", content: { "application/json": { schema: { type: "object" } } } },
            401: { description: "Unauthorized", content: { "application/json": { schema: ref("Error") } } },
          },
        },
        post: {
          tags: ["Media"],
          summary: "Upload media asset",
          requestBody: {
            required: true,
            content: { "multipart/form-data": { schema: { type: "object", properties: { file: { type: "string", format: "binary" } }, required: ["file"] } } },
          },
          responses: {
            201: { description: "Uploaded asset", content: { "application/json": { schema: { type: "object" } } } },
            401: { description: "Unauthorized", content: { "application/json": { schema: ref("Error") } } },
          },
        },
      },

      "/api/media/{id}": {
        delete: {
          tags: ["Media"],
          summary: "Delete media asset",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            204: { description: "Deleted" },
            401: { description: "Unauthorized", content: { "application/json": { schema: ref("Error") } } },
          },
        },
      },

      // API Keys
      "/api/api-keys": {
        get: {
          tags: ["API Keys"],
          summary: "List API keys",
          responses: {
            200: { description: "API keys (prefix only, never raw key)", content: { "application/json": { schema: { type: "object", properties: { keys: { type: "array", items: ref("ApiKey") } } } } } },
            401: { description: "Unauthorized", content: { "application/json": { schema: ref("Error") } } },
          },
        },
        post: {
          tags: ["API Keys"],
          summary: "Create API key",
          description: "Returns the raw key once. Store it securely — it cannot be retrieved again.",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object", required: ["name"], properties: { name: { type: "string" }, expiresAt: { type: "string", format: "date-time", nullable: true } } } } },
          },
          responses: {
            201: {
              description: "Created. `key` is shown once only.",
              content: { "application/json": { schema: { type: "object", properties: { key: { type: "string", description: "Raw API key — store securely" }, id: { type: "string" }, prefix: { type: "string" } } } } },
            },
            401: { description: "Unauthorized", content: { "application/json": { schema: ref("Error") } } },
          },
        },
      },

      "/api/api-keys/{id}": {
        delete: {
          tags: ["API Keys"],
          summary: "Revoke API key",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            204: { description: "Revoked" },
            401: { description: "Unauthorized", content: { "application/json": { schema: ref("Error") } } },
          },
        },
      },

      // Settings
      "/api/settings": {
        get: {
          tags: ["Settings"],
          summary: "Get user settings",
          responses: {
            200: {
              description: "User profile and preferences",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      name: { type: "string", nullable: true },
                      email: { type: "string" },
                      timezone: { type: "string" },
                      emailNotifications: { type: "boolean" },
                      theme: { type: "string", enum: ["light", "dark", "system"] },
                    },
                  },
                },
              },
            },
            401: { description: "Unauthorized", content: { "application/json": { schema: ref("Error") } } },
          },
        },
        patch: {
          tags: ["Settings"],
          summary: "Update user settings",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    timezone: { type: "string" },
                    emailNotifications: { type: "boolean" },
                    theme: { type: "string", enum: ["light", "dark", "system"] },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Updated settings" },
            401: { description: "Unauthorized", content: { "application/json": { schema: ref("Error") } } },
          },
        },
      },

      // Zap endpoints (API key auth)
      "/api/zap/posts": {
        get: {
          tags: ["Zap"],
          summary: "Zapier: newest posts",
          description: "Returns newest posts (up to 10). Use with Zapier polling triggers. Requires API key via `x-api-key` header.",
          security: [{ apiKeyAuth: [] }],
          parameters: [{ name: "since", in: "query", schema: { type: "string", format: "date-time" }, description: "Only posts created after this ISO date" }],
          responses: {
            200: { description: "Posts list", content: { "application/json": { schema: { type: "array", items: ref("Post") } } } },
            401: { description: "Invalid or missing API key", content: { "application/json": { schema: ref("Error") } } },
          },
        },
      },

      "/api/zap/published": {
        get: {
          tags: ["Zap"],
          summary: "Zapier: recently published posts",
          description: "Returns recently PUBLISHED posts (since optional `?since=` date, default last 24h). Requires API key.",
          security: [{ apiKeyAuth: [] }],
          parameters: [{ name: "since", in: "query", schema: { type: "string", format: "date-time" } }],
          responses: {
            200: { description: "Published posts", content: { "application/json": { schema: { type: "array", items: ref("Post") } } } },
            401: { description: "Invalid or missing API key", content: { "application/json": { schema: ref("Error") } } },
          },
        },
      },
    },
  };
}
