import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link2 } from "lucide-react";
import { CreateUtmPresetForm } from "./create-utm-preset-form";
import { UtmPresetRow } from "./utm-preset-row";

export default async function UtmPresetsPage() {
  const session = await auth();
  const userId = session!.user!.id;

  const presets = await prisma.utmPreset.findMany({
    where: { userId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      source: true,
      medium: true,
      campaign: true,
      content: true,
      term: true,
      isDefault: true,
      createdAt: true,
    },
  });

  return (
    <div className="flex flex-col gap-8 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">UTM Tags</h1>
        <p className="text-muted-foreground">
          Save UTM parameter presets to auto-tag links in your posts for analytics tracking.
        </p>
      </div>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>New preset</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateUtmPresetForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {presets.length} preset{presets.length !== 1 ? "s" : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {presets.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <Link2 className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No UTM presets yet</p>
              <p className="text-xs text-muted-foreground">
                Create your first preset above to start tagging links in your posts.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {presets.map((preset) => (
                <UtmPresetRow key={preset.id} preset={preset} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
