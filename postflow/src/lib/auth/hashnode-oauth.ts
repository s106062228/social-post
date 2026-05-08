import { z } from "zod";

const HASHNODE_GQL_ENDPOINT = "https://gql.hashnode.com";

// ── Types ─────────────────────────────────────────────────────────────────────

export type HashnodeToken = {
  apiToken: string;
  username: string;
  name: string;
  /** The Hashnode publication ID (used to publish posts) */
  publicationId: string;
  /** Public URL of the publication */
  publicationUrl: string;
};

// ── Zod schemas ───────────────────────────────────────────────────────────────

const meResponseSchema = z.object({
  data: z.object({
    me: z.object({
      id: z.string(),
      username: z.string(),
      name: z.string(),
      publications: z.object({
        edges: z.array(
          z.object({
            node: z.object({
              id: z.string(),
              title: z.string(),
              url: z.string(),
            }),
          })
        ),
      }),
    }),
  }),
});

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Verify a Hashnode personal access token by calling the GraphQL API.
 * Returns user info and their first publication.
 */
export async function verifyHashnodeToken(apiToken: string): Promise<{
  username: string;
  name: string;
  publicationId: string;
  publicationUrl: string;
}> {
  const query = `
    query {
      me {
        id
        username
        name
        publications(first: 1) {
          edges {
            node {
              id
              title
              url
            }
          }
        }
      }
    }
  `;

  const response = await fetch(HASHNODE_GQL_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: apiToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`Hashnode API error (${response.status}): ${text}`);
  }

  const data: unknown = await response.json();
  const parsed = meResponseSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error("Unexpected Hashnode API response format");
  }

  const me = parsed.data.data.me;
  const firstPublication = me.publications.edges[0]?.node;

  if (!firstPublication) {
    throw new Error(
      "No Hashnode publication found. Please create a publication first."
    );
  }

  return {
    username: me.username,
    name: me.name,
    publicationId: firstPublication.id,
    publicationUrl: firstPublication.url,
  };
}

export function serializeHashnodeToken(token: HashnodeToken): string {
  return JSON.stringify(token);
}

export function parseHashnodeToken(raw: string): HashnodeToken {
  const parsed: unknown = JSON.parse(raw);
  const schema = z.object({
    apiToken: z.string(),
    username: z.string(),
    name: z.string(),
    publicationId: z.string(),
    publicationUrl: z.string(),
  });
  return schema.parse(parsed);
}
