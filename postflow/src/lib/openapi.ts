const serverUrl =
  process.env.NEXTAUTH_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

export function generateOpenApiSpec() {
  return {
    openapi: "3.0.3",
    info: {
      title: "PostFlow API",
      version: "1.0.0",
      description:
        "PostFlow social media scheduling API. All authenticated endpoints require a valid session cookie or an `x-api-key` header for Zapier-compatible triggers.",
      contact: {
        name: "PostFlow Support",
        url: `${serverUrl}`,
      },
    },
    servers: [{ url: serverUrl, description: "PostFlow server" }],
    components: {
      securitySchemes: {
        sessionCookie: {
          type: "apiKey",
          in: "cookie",
          name: "next-auth.session-token",
          description: "NextAuth.js session cookie (browser sessions)",
        },
        apiKey: {
          type: "apiKey",
          in: "header",
          name: "x-api-key",
          description: "Personal API key (Zapier / programmatic access)",
        },
      },
      schemas: {
        Post: {
          type: "object",
          properties: {
            id: { type: "string" },
            content: { type: "string" },
            mediaType: {
              type: "string",
              enum: ["NONE", "IMAGE", "VIDEO", "CAROUSEL"],
            },
            mediaUrls: { type: "array", items: { type: "string" } },
            status: {
              type: "string",
              enum: [
                "DRAFT",
                "SCHEDULED",
                "PUBLISHING",
                "PUBLISHED",
                "PARTIALLY_PUBLISHED",
                "FAILED",
              ],
            },
            scheduledAt: {
              type: "string",
              format: "date-time",
              nullable: true,
            },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        SocialAccount: {
          type: "object",
          properties: {
            id: { type: "string" },
            platform: {
              type: "string",
              enum: [
                "FACEBOOK",
                "INSTAGRAM",
                "THREADS",
                "LINKEDIN",
                "PINTEREST",
                "YOUTUBE",
                "TIKTOK",
                "TWITTER",
                "BLUESKY",
                "MASTODON",
                "TELEGRAM",
                "REDDIT",
                "NOSTR",
                "TUMBLR",
                "WORDPRESS",
                "MEDIUM",
                "GHOST",
                "DEVTO",
                "GOOGLE_BUSINESS",
                "HASHNODE",
              ],
            },
            accountName: { type: "string" },
            isActive: { type: "boolean" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        Template: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            content: { type: "string" },
            mediaType: {
              type: "string",
              enum: ["NONE", "IMAGE", "VIDEO", "CAROUSEL"],
            },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        Campaign: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            description: { type: "string", nullable: true },
            goal: { type: "string", nullable: true },
            startDate: {
              type: "string",
              format: "date-time",
              nullable: true,
            },
            endDate: { type: "string", format: "date-time", nullable: true },
            isActive: { type: "boolean" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        Error: {
          type: "object",
          properties: {
            error: { type: "string" },
          },
        },
      },
    },
    security: [{ sessionCookie: [] }],
    paths: {
      "/api/health": {
        get: {
          summary: "Health check",
          description:
            "Returns the health status of the API including database and Redis connectivity.",
          security: [],
          tags: ["System"],
          responses: {
            "200": {
              description: "System healthy",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      status: { type: "string", enum: ["ok", "degraded"] },
                      db: { type: "string" },
                      redis: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/posts": {
        get: {
          summary: "List posts",
          description:
            "Returns the authenticated user's posts with optional filtering.",
          tags: ["Posts"],
          parameters: [
            {
              name: "status",
              in: "query",
              schema: {
                type: "string",
                enum: [
                  "DRAFT",
                  "SCHEDULED",
                  "PUBLISHING",
                  "PUBLISHED",
                  "PARTIALLY_PUBLISHED",
                  "FAILED",
                ],
              },
            },
            { name: "search", in: "query", schema: { type: "string" } },
            { name: "platform", in: "query", schema: { type: "string" } },
            { name: "tag", in: "query", schema: { type: "string" } },
            {
              name: "starred",
              in: "query",
              schema: { type: "boolean" },
            },
            {
              name: "evergreen",
              in: "query",
              schema: { type: "boolean" },
            },
            {
              name: "archived",
              in: "query",
              schema: { type: "boolean" },
            },
            {
              name: "sentiment",
              in: "query",
              schema: {
                type: "string",
                enum: ["POSITIVE", "NEUTRAL", "NEGATIVE"],
              },
            },
            { name: "from", in: "query", schema: { type: "string", format: "date-time" } },
            { name: "to", in: "query", schema: { type: "string", format: "date-time" } },
          ],
          responses: {
            "200": {
              description: "List of posts",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      posts: {
                        type: "array",
                        items: { $ref: "#/components/schemas/Post" },
                      },
                    },
                  },
                },
              },
            },
            "401": { description: "Unauthorized" },
          },
        },
        post: {
          summary: "Create post",
          tags: ["Posts"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["content", "mediaType", "selectedAccountIds"],
                  properties: {
                    content: { type: "string" },
                    mediaType: {
                      type: "string",
                      enum: ["NONE", "IMAGE", "VIDEO", "CAROUSEL"],
                    },
                    mediaUrls: { type: "array", items: { type: "string" } },
                    scheduledAt: { type: "string", format: "date-time" },
                    selectedAccountIds: {
                      type: "array",
                      items: { type: "string" },
                    },
                    tagIds: { type: "array", items: { type: "string" } },
                    firstComment: { type: "string", nullable: true },
                    reminderMinutes: { type: "integer", nullable: true },
                    language: { type: "string", nullable: true },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Created post",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Post" },
                },
              },
            },
            "400": { description: "Validation error" },
            "401": { description: "Unauthorized" },
          },
        },
      },
      "/api/posts/{id}": {
        get: {
          summary: "Get post",
          tags: ["Posts"],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            "200": {
              description: "Post",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Post" },
                },
              },
            },
            "401": { description: "Unauthorized" },
            "404": { description: "Not found" },
          },
        },
        patch: {
          summary: "Update post",
          tags: ["Posts"],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
          ],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    content: { type: "string" },
                    scheduledAt: { type: "string", format: "date-time" },
                    status: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Updated post" },
            "401": { description: "Unauthorized" },
            "404": { description: "Not found" },
          },
        },
        delete: {
          summary: "Delete post",
          tags: ["Posts"],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            "200": { description: "Deleted" },
            "401": { description: "Unauthorized" },
            "404": { description: "Not found" },
          },
        },
      },
      "/api/posts/bulk": {
        delete: {
          summary: "Bulk delete posts",
          tags: ["Posts"],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["ids"],
                  properties: {
                    ids: { type: "array", items: { type: "string" } },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Deleted count" },
            "401": { description: "Unauthorized" },
          },
        },
      },
      "/api/posts/export": {
        get: {
          summary: "Export posts as CSV",
          description: "Streams all user posts as a downloadable CSV file.",
          tags: ["Posts"],
          parameters: [
            { name: "status", in: "query", schema: { type: "string" } },
            { name: "search", in: "query", schema: { type: "string" } },
          ],
          responses: {
            "200": {
              description: "CSV file",
              content: { "text/csv": { schema: { type: "string" } } },
            },
            "401": { description: "Unauthorized" },
          },
        },
      },
      "/api/publish": {
        post: {
          summary: "Publish a post immediately",
          tags: ["Publish"],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["postId"],
                  properties: {
                    postId: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Publish results" },
            "400": { description: "Already publishing or published" },
            "401": { description: "Unauthorized" },
            "404": { description: "Post not found" },
          },
        },
      },
      "/api/accounts": {
        get: {
          summary: "List social accounts",
          tags: ["Accounts"],
          responses: {
            "200": {
              description: "List of connected social accounts",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      accounts: {
                        type: "array",
                        items: { $ref: "#/components/schemas/SocialAccount" },
                      },
                    },
                  },
                },
              },
            },
            "401": { description: "Unauthorized" },
          },
        },
      },
      "/api/accounts/{id}": {
        delete: {
          summary: "Disconnect a social account",
          tags: ["Accounts"],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            "200": { description: "Account disconnected" },
            "401": { description: "Unauthorized" },
            "404": { description: "Not found" },
          },
        },
      },
      "/api/accounts/{id}/check": {
        post: {
          summary: "Verify account token validity",
          tags: ["Accounts"],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            "200": {
              description: "Token validity result",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { valid: { type: "boolean" } },
                  },
                },
              },
            },
            "401": { description: "Unauthorized" },
          },
        },
      },
      "/api/templates": {
        get: {
          summary: "List templates",
          tags: ["Templates"],
          responses: {
            "200": {
              description: "Templates",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      templates: {
                        type: "array",
                        items: { $ref: "#/components/schemas/Template" },
                      },
                    },
                  },
                },
              },
            },
            "401": { description: "Unauthorized" },
          },
        },
        post: {
          summary: "Create template",
          tags: ["Templates"],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["name", "content", "mediaType"],
                  properties: {
                    name: { type: "string" },
                    content: { type: "string" },
                    mediaType: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Created template" },
            "401": { description: "Unauthorized" },
          },
        },
      },
      "/api/templates/{id}": {
        delete: {
          summary: "Delete template",
          tags: ["Templates"],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            "200": { description: "Deleted" },
            "401": { description: "Unauthorized" },
          },
        },
      },
      "/api/campaigns": {
        get: {
          summary: "List campaigns",
          tags: ["Campaigns"],
          responses: {
            "200": {
              description: "Campaigns",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      campaigns: {
                        type: "array",
                        items: { $ref: "#/components/schemas/Campaign" },
                      },
                    },
                  },
                },
              },
            },
            "401": { description: "Unauthorized" },
          },
        },
        post: {
          summary: "Create campaign",
          tags: ["Campaigns"],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["name"],
                  properties: {
                    name: { type: "string" },
                    description: { type: "string" },
                    goal: { type: "string" },
                    startDate: { type: "string", format: "date-time" },
                    endDate: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Created campaign" },
            "401": { description: "Unauthorized" },
          },
        },
      },
      "/api/analytics/summary": {
        get: {
          summary: "Analytics summary",
          tags: ["Analytics"],
          responses: {
            "200": {
              description: "Summary statistics",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      postsByStatus: { type: "object" },
                      platformBreakdown: { type: "object" },
                      successRate: { type: "number" },
                      dailyActivity: { type: "array", items: { type: "object" } },
                    },
                  },
                },
              },
            },
            "401": { description: "Unauthorized" },
          },
        },
      },
      "/api/analytics/dashboard": {
        get: {
          summary: "Analytics dashboard data",
          tags: ["Analytics"],
          parameters: [
            {
              name: "period",
              in: "query",
              schema: { type: "string", enum: ["7d", "30d", "90d"] },
            },
          ],
          responses: {
            "200": { description: "Dashboard metrics" },
            "401": { description: "Unauthorized" },
          },
        },
      },
      "/api/analytics/leaderboard": {
        get: {
          summary: "Post performance leaderboard",
          tags: ["Analytics"],
          parameters: [
            { name: "limit", in: "query", schema: { type: "integer" } },
            {
              name: "period",
              in: "query",
              schema: { type: "string", enum: ["7d", "30d", "90d", "all"] },
            },
          ],
          responses: {
            "200": { description: "Ranked posts by engagement score" },
            "401": { description: "Unauthorized" },
          },
        },
      },
      "/api/analytics/best-times": {
        get: {
          summary: "Best times to post",
          tags: ["Analytics"],
          parameters: [
            { name: "platform", in: "query", schema: { type: "string" } },
          ],
          responses: {
            "200": { description: "Recommended posting hours" },
            "401": { description: "Unauthorized" },
          },
        },
      },
      "/api/analytics/consistency": {
        get: {
          summary: "Posting consistency score",
          tags: ["Analytics"],
          parameters: [
            {
              name: "period",
              in: "query",
              schema: { type: "string", enum: ["30d", "90d", "180d"] },
            },
          ],
          responses: {
            "200": { description: "Consistency score and gap analysis" },
            "401": { description: "Unauthorized" },
          },
        },
      },
      "/api/schedules": {
        get: {
          summary: "List recurring schedules",
          tags: ["Schedules"],
          responses: {
            "200": { description: "Recurring schedules" },
            "401": { description: "Unauthorized" },
          },
        },
        post: {
          summary: "Create recurring schedule",
          tags: ["Schedules"],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["name", "content", "mediaType", "cronExpr", "timezone"],
                  properties: {
                    name: { type: "string" },
                    content: { type: "string" },
                    mediaType: { type: "string" },
                    cronExpr: { type: "string" },
                    timezone: { type: "string" },
                    isActive: { type: "boolean" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Created schedule" },
            "401": { description: "Unauthorized" },
          },
        },
      },
      "/api/webhook-configs": {
        get: {
          summary: "List outgoing webhook configs",
          tags: ["Webhooks"],
          responses: {
            "200": { description: "Webhook configs" },
            "401": { description: "Unauthorized" },
          },
        },
        post: {
          summary: "Create webhook config",
          tags: ["Webhooks"],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["url", "events"],
                  properties: {
                    url: { type: "string", format: "uri" },
                    events: { type: "array", items: { type: "string" } },
                    secret: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Created webhook config" },
            "401": { description: "Unauthorized" },
          },
        },
      },
      "/api/api-keys": {
        get: {
          summary: "List API keys",
          tags: ["API Keys"],
          responses: {
            "200": { description: "API key list (prefix only, never raw key)" },
            "401": { description: "Unauthorized" },
          },
        },
        post: {
          summary: "Create API key",
          description: "Returns the raw key exactly once. Store it securely.",
          tags: ["API Keys"],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["name"],
                  properties: {
                    name: { type: "string" },
                    expiresAt: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Created key — raw value shown once",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      key: { type: "string" },
                      id: { type: "string" },
                      prefix: { type: "string" },
                    },
                  },
                },
              },
            },
            "401": { description: "Unauthorized" },
          },
        },
      },
      "/api/zap/posts": {
        get: {
          summary: "Zapier trigger — new posts",
          description: "Returns newest posts for Zapier polling. Auth via x-api-key header.",
          tags: ["Zapier"],
          security: [{ apiKey: [] }],
          parameters: [
            {
              name: "since",
              in: "query",
              schema: { type: "string", format: "date-time" },
            },
          ],
          responses: {
            "200": { description: "Posts" },
            "401": { description: "Invalid or missing API key" },
          },
        },
      },
      "/api/zap/published": {
        get: {
          summary: "Zapier trigger — published posts",
          description: "Returns recently published posts. Auth via x-api-key header.",
          tags: ["Zapier"],
          security: [{ apiKey: [] }],
          parameters: [
            {
              name: "since",
              in: "query",
              schema: { type: "string", format: "date-time" },
            },
          ],
          responses: {
            "200": { description: "Published posts" },
            "401": { description: "Invalid or missing API key" },
          },
        },
      },
      "/api/notifications": {
        get: {
          summary: "List notifications",
          tags: ["Notifications"],
          responses: {
            "200": { description: "Notifications with unread count" },
            "401": { description: "Unauthorized" },
          },
        },
      },
      "/api/notifications/read-all": {
        post: {
          summary: "Mark all notifications as read",
          tags: ["Notifications"],
          responses: {
            "200": { description: "All marked read" },
            "401": { description: "Unauthorized" },
          },
        },
      },
      "/api/settings": {
        get: {
          summary: "Get user settings",
          tags: ["Settings"],
          responses: {
            "200": { description: "User profile and preferences" },
            "401": { description: "Unauthorized" },
          },
        },
        patch: {
          summary: "Update user settings",
          tags: ["Settings"],
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
            "200": { description: "Updated settings" },
            "401": { description: "Unauthorized" },
          },
        },
      },
      "/api/search": {
        get: {
          summary: "Global search",
          tags: ["Search"],
          parameters: [
            {
              name: "q",
              in: "query",
              required: true,
              schema: { type: "string", minLength: 2 },
            },
          ],
          responses: {
            "200": { description: "Search results grouped by type" },
            "400": { description: "Query too short" },
            "401": { description: "Unauthorized" },
          },
        },
      },
      "/api/media": {
        get: {
          summary: "List media assets",
          tags: ["Media"],
          parameters: [
            { name: "page", in: "query", schema: { type: "integer" } },
          ],
          responses: {
            "200": { description: "Paginated media assets" },
            "401": { description: "Unauthorized" },
          },
        },
        post: {
          summary: "Upload media asset",
          tags: ["Media"],
          requestBody: {
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  properties: {
                    file: { type: "string", format: "binary" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Uploaded asset with public URL" },
            "401": { description: "Unauthorized" },
          },
        },
      },
      "/api/docs/openapi.json": {
        get: {
          summary: "OpenAPI specification",
          description: "Returns this OpenAPI 3.0 specification. No authentication required.",
          tags: ["System"],
          security: [],
          responses: {
            "200": {
              description: "OpenAPI 3.0 spec",
              content: {
                "application/json": { schema: { type: "object" } },
              },
            },
          },
        },
      },
    },
  };
}
