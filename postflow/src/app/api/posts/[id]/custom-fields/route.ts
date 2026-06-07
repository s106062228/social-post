import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handleRouteError } from "@/lib/errors";
import { apiLimiter, rateLimitHeaders } from "@/lib/rate-limit";

const CUID_RE = /^c[a-z0-9]{20,}$/i;

const putSchema = z.object({
  values: z.array(
    z.object({
      fieldId: z.string(),
      value: z.string().max(1000),
    })
  ),
});

// ── GET /api/posts/[id]/custom-fields ─────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = await apiLimiter(session.user.id);
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: rateLimitHeaders(rl) }
      );
    }

    const { id } = await params;
    if (!CUID_RE.test(id)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const post = await prisma.post.findUnique({ where: { id } });
    if (!post || post.userId !== session.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const fieldValues = await prisma.postCustomFieldValue.findMany({
      where: { postId: id },
      include: {
        field: {
          select: { key: true, label: true, fieldType: true, options: true, isRequired: true },
        },
      },
      orderBy: { field: { order: "asc" } },
    });

    const values = fieldValues.map((fv) => ({
      id: fv.id,
      fieldId: fv.fieldId,
      key: fv.field.key,
      label: fv.field.label,
      fieldType: fv.field.fieldType,
      options: fv.field.options,
      isRequired: fv.field.isRequired,
      value: fv.value,
    }));

    return NextResponse.json({ values });
  } catch (err) {
    return handleRouteError(err);
  }
}

// ── PUT /api/posts/[id]/custom-fields ─────────────────────────────────────────

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = await apiLimiter(session.user.id);
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: rateLimitHeaders(rl) }
      );
    }

    const { id } = await params;
    if (!CUID_RE.test(id)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const post = await prisma.post.findUnique({ where: { id } });
    if (!post || post.userId !== session.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = putSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    // Validate that all fieldIds belong to this user and check required fields
    const fieldIds = parsed.data.values.map((v) => v.fieldId);
    const userFields = await prisma.customField.findMany({
      where: { userId: session.user.id, isActive: true },
    });

    const userFieldMap = new Map(userFields.map((f) => [f.id, f]));

    // Check all provided fieldIds are valid
    for (const fieldId of fieldIds) {
      if (!userFieldMap.has(fieldId)) {
        return NextResponse.json(
          { error: `Field ${fieldId} not found` },
          { status: 400 }
        );
      }
    }

    // Check required fields have values
    const providedFieldIds = new Set(fieldIds);
    for (const field of userFields) {
      if (field.isRequired && !providedFieldIds.has(field.id)) {
        return NextResponse.json(
          { error: `Required field "${field.label}" must have a value` },
          { status: 422 }
        );
      }
    }

    // Upsert all values in a transaction
    await prisma.$transaction(
      parsed.data.values.map((v) =>
        prisma.postCustomFieldValue.upsert({
          where: { postId_fieldId: { postId: id, fieldId: v.fieldId } },
          create: { postId: id, fieldId: v.fieldId, value: v.value },
          update: { value: v.value },
        })
      )
    );

    // Return updated values
    const updated = await prisma.postCustomFieldValue.findMany({
      where: { postId: id },
      include: {
        field: {
          select: { key: true, label: true, fieldType: true, options: true, isRequired: true },
        },
      },
      orderBy: { field: { order: "asc" } },
    });

    const values = updated.map((fv) => ({
      id: fv.id,
      fieldId: fv.fieldId,
      key: fv.field.key,
      label: fv.field.label,
      fieldType: fv.field.fieldType,
      options: fv.field.options,
      isRequired: fv.field.isRequired,
      value: fv.value,
    }));

    return NextResponse.json({ values });
  } catch (err) {
    return handleRouteError(err);
  }
}
