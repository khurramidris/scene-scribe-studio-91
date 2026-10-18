import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { ImageUploadButton } from "./ImageUploadButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/modules/auth/useAuth";
import { signReferenceUrls } from "@/lib/character-image.functions";
import { IMAGE_UPLOAD_HELP } from "@/lib/image-upload";
import { uploadStudioImage } from "@/lib/image-upload.service";
import { registerReferenceUpload } from "@/lib/reference-upload.functions";
import { locationsQuery, screenplayKeys } from "@/modules/screenplay/screenplay.queries";
import { createLocation, updateLocation } from "@/modules/screenplay/screenplay.service";
import type { ProductionLocation } from "@/modules/screenplay/screenplay.types";

export function LocationLibrary({ projectId, open = true }: { projectId: string; open?: boolean }) {
  const queryClient = useQueryClient();
  const sign = useServerFn(signReferenceUrls);
  const { data: locations = [], error } = useQuery(locationsQuery(projectId));
  const paths = locations.flatMap((location) =>
    location.reference_storage_path ? [location.reference_storage_path] : [],
  );
  const { data: urls = {}, error: previewError } = useQuery({
    queryKey: ["set-image-urls", projectId, paths],
    enabled: paths.length > 0,
    staleTime: 40 * 60 * 1000,
    refetchInterval: 45 * 60 * 1000,
    queryFn: async () => {
      const signed: Record<string, string> = {};
      for (let i = 0; i < paths.length; i += 60) {
        Object.assign(signed, (await sign({ data: { paths: paths.slice(i, i + 60) } })).urls);
      }
      return signed;
    },
  });
  const changed = () => {
    void queryClient.invalidateQueries({ queryKey: screenplayKeys.locations(projectId) });
  };
  const add = useMutation({
    mutationFn: (name: string) => createLocation(projectId, name),
    onSuccess: changed,
    onError: (cause: Error) => toast.error(cause.message),
  });

  return (
    <details id="sets" open={open} className="panel mt-8 rounded-xl border border-border p-5">
      <summary className="cursor-pointer text-base font-semibold">Sets & locations</summary>
      <p className="mt-2 text-sm text-muted-foreground">
        Upload your own set photo, illustration or render. Choose this location in a scene or shot
        to reuse its image when generating storyboards.
      </p>
      <form
        className="mt-4 flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const name = String(new FormData(form).get("name") ?? "").trim();
          if (name) add.mutate(name, { onSuccess: () => form.reset() });
        }}
      >
        <div className="min-w-48 flex-1 space-y-2">
          <Label htmlFor={`set-name-${projectId}`}>New set or location</Label>
          <Input
            id={`set-name-${projectId}`}
            name="name"
            placeholder="Family home, office, rooftop…"
            maxLength={120}
            required
          />
        </div>
        <Button type="submit" variant="secondary" disabled={add.isPending}>
          <Plus className="size-4" /> Add set
        </Button>
      </form>
      {error || previewError ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {(error ?? previewError)?.message}
        </p>
      ) : null}
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {locations.map((location) => (
          <LocationCard
            key={location.id}
            location={location}
            previewUrl={
              location.reference_storage_path ? urls[location.reference_storage_path] : undefined
            }
            onChanged={changed}
          />
        ))}
      </div>
      {!locations.length ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Add a set to upload its reference image.
        </p>
      ) : null}
    </details>
  );
}

function LocationCard({
  location,
  previewUrl,
  onChanged,
}: {
  location: ProductionLocation;
  previewUrl: string | undefined;
  onChanged: () => void;
}) {
  const { user } = useAuth();
  const register = useServerFn(registerReferenceUpload);
  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (!user) throw new Error("Sign in first.");
      return uploadStudioImage(
        file,
        "character-references",
        `${user.id}/${location.project_id}/location/${location.id}/`,
        (storagePath) =>
          register({
            data: {
              target: "location",
              entityId: location.id,
              storagePath,
              mimeType: file.type as "image/png" | "image/jpeg" | "image/webp",
              originalName: file.name.slice(0, 200),
            },
          }),
      );
    },
    onSuccess: () => {
      onChanged();
      toast.success("Set image selected. New storyboards using this location will use it.");
    },
    onError: (cause: Error) => toast.error(cause.message),
  });
  const save = useMutation({
    mutationFn: (description: string) => updateLocation(location.id, { description }),
    onSuccess: () => {
      onChanged();
      toast.success("Set details saved.");
    },
    onError: (cause: Error) => toast.error(cause.message),
  });
  return (
    <article className="rounded-lg border border-border p-4">
      <h3 className="font-semibold">{location.name}</h3>
      {previewUrl ? (
        <img
          src={previewUrl}
          alt={`${location.name} set reference`}
          className="mt-3 aspect-video w-full rounded-md object-cover"
        />
      ) : (
        <div className="mt-3 flex aspect-video items-center justify-center rounded-md bg-secondary text-sm text-muted-foreground">
          {location.reference_storage_path ? "Loading set image…" : "No set image uploaded"}
        </div>
      )}
      <div className="mt-3">
        <ImageUploadButton
          label={location.reference_storage_path ? "Replace set image" : "Upload set image"}
          busy={upload.isPending}
          onPick={(file) => upload.mutate(file)}
        />
        <p className="mt-1 text-xs text-muted-foreground">{IMAGE_UPLOAD_HELP}</p>
      </div>
      <form
        className="mt-3 space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate(String(new FormData(event.currentTarget).get("description") ?? "").trim());
        }}
      >
        <Label htmlFor={`set-description-${location.id}`}>Set details</Label>
        <Textarea
          id={`set-description-${location.id}`}
          name="description"
          defaultValue={location.description ?? ""}
          placeholder="Architecture, furniture, colors and details to preserve"
          rows={2}
          maxLength={2000}
        />
        <Button type="submit" size="sm" variant="secondary" disabled={save.isPending}>
          Save details
        </Button>
      </form>
    </article>
  );
}
