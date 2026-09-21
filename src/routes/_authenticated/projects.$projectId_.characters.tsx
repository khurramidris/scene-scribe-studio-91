import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Check, Images, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { StudioShell } from "@/components/layout/StudioShell";
import { ProjectNav } from "@/components/studio/ProjectNav";
import { MockBadge, StatusBadge } from "@/components/studio/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { generateCharacterImages, signReferenceUrls } from "@/lib/character-image.functions";
import { generateStory } from "@/lib/story.functions";
import {
  characterKeys,
  charactersQuery,
  referencesQuery,
  relationshipsQuery,
} from "@/modules/characters/character.queries";
import {
  approveReference,
  createCharacter,
  createRelationship,
  deleteCharacter,
  deleteReference,
  deleteRelationship,
  updateCharacter,
} from "@/modules/characters/character.service";
import {
  REFERENCE_KIND_LABELS,
  type Character,
  type CharacterReference,
  type ReferenceKind,
} from "@/modules/characters/character.types";
import { projectQuery } from "@/modules/projects/project.queries";

export const Route = createFileRoute("/_authenticated/projects/$projectId_/characters")({
  head: () => ({
    meta: [
      { title: "Character studio — Backlot Studio" },
      {
        name: "description",
        content:
          "Build character profiles, relationships and a locked visual identity reference library.",
      },
      { property: "og:title", content: "Character studio — Backlot Studio" },
      {
        property: "og:description",
        content:
          "Build character profiles, relationships and a locked visual identity reference library.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CharacterStudio,
});

function CharacterStudio() {
  const { projectId } = Route.useParams();
  const queryClient = useQueryClient();
  const runStory = useServerFn(generateStory);

  const { data: project } = useQuery(projectQuery(projectId));
  const { data: characters, isLoading } = useQuery(charactersQuery(projectId));
  const { data: references } = useQuery(referencesQuery(projectId));
  const { data: relationships } = useQuery(relationshipsQuery(projectId));

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: characterKeys.list(projectId) });
    void queryClient.invalidateQueries({ queryKey: characterKeys.references(projectId) });
    void queryClient.invalidateQueries({ queryKey: characterKeys.relationships(projectId) });
  };

  const suggest = useMutation({
    mutationFn: () =>
      runStory({ data: { projectId, task: "characters", language: project?.language ?? "en" } }),
    onSuccess: (result) => {
      invalidate();
      toast[result.isMock ? "warning" : "success"](
        result.isMock
          ? "Drafted with the development mock — no AI provider is configured."
          : "Characters drafted.",
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const add = useMutation({
    mutationFn: (name: string) => createCharacter(projectId, { name }),
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <StudioShell>
      <Link
        to="/projects/$projectId"
        params={{ projectId }}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {project?.title ?? "Production"}
      </Link>
      <h1 className="mt-3 text-2xl font-semibold">Character studio</h1>
      <ProjectNav projectId={projectId} />

      <div className="panel mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-border p-5">
        <form
          className="flex flex-1 flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const name = String(new FormData(form).get("name") ?? "").trim();
            if (!name) return;
            add.mutate(name, { onSuccess: () => form.reset() });
          }}
        >
          <div className="min-w-48 flex-1 space-y-2">
            <Label htmlFor="name">New character</Label>
            <Input id="name" name="name" placeholder="Character name" />
          </div>
          <Button type="submit" variant="secondary" disabled={add.isPending}>
            Add
          </Button>
        </form>
        <Button onClick={() => suggest.mutate()} disabled={suggest.isPending}>
          {suggest.isPending ? (
            <RefreshCw className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          {suggest.isPending ? "Drafting…" : "Draft cast from the story"}
        </Button>
      </div>

      {isLoading ? <p className="mt-6 text-sm text-muted-foreground">Loading cast…</p> : null}

      <div className="mt-6 space-y-5">
        {(characters ?? []).map((character) => (
          <CharacterCard
            key={character.id}
            character={character}
            projectId={projectId}
            references={(references ?? []).filter((r) => r.character_id === character.id)}
          />
        ))}
        {characters && characters.length === 0 && !isLoading ? (
          <p className="text-sm text-muted-foreground">
            No characters yet. Add one by hand, or draft a cast from the approved story material.
          </p>
        ) : null}
      </div>

      {characters && characters.length > 1 ? (
        <section className="panel mt-8 rounded-xl border border-border p-5">
          <h2 className="text-base font-semibold">Relationships</h2>
          <form
            className="mt-3 grid gap-3 sm:grid-cols-4"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const data = new FormData(form);
              const from = String(data.get("from") ?? "");
              const to = String(data.get("to") ?? "");
              const label = String(data.get("relationship") ?? "").trim();
              if (!from || !to || !label || from === to) {
                toast.error("Pick two different characters and describe the relationship.");
                return;
              }
              void createRelationship(projectId, from, to, label)
                .then(() => {
                  form.reset();
                  invalidate();
                })
                .catch((error: Error) => toast.error(error.message));
            }}
          >
            <select name="from" className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">
              {characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <Input name="relationship" placeholder="is the estranged sister of" />
            <select name="to" className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">
              {characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <Button type="submit" variant="secondary">
              Add link
            </Button>
          </form>
          <ul className="mt-4 space-y-2 text-sm">
            {(relationships ?? []).map((rel) => {
              const from = characters.find((c) => c.id === rel.from_character_id)?.name ?? "—";
              const to = characters.find((c) => c.id === rel.to_character_id)?.name ?? "—";
              return (
                <li key={rel.id} className="flex items-center gap-2 rounded-md border border-border p-2">
                  <span>
                    <strong>{from}</strong> {rel.relationship} <strong>{to}</strong>
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto"
                    onClick={() => {
                      void deleteRelationship(rel.id).then(invalidate);
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </StudioShell>
  );
}

const KINDS: ReferenceKind[] = ["appearance", "costume", "expression", "prop"];

function CharacterCard({
  character,
  projectId,
  references,
}: {
  character: Character;
  projectId: string;
  references: CharacterReference[];
}) {
  const queryClient = useQueryClient();
  const runImages = useServerFn(generateCharacterImages);
  const sign = useServerFn(signReferenceUrls);
  const [kind, setKind] = useState<ReferenceKind>("appearance");
  const [label, setLabel] = useState("");
  const [urls, setUrls] = useState<Record<string, string>>({});

  const paths = useMemo(
    () => references.map((r) => r.storage_path).filter((p): p is string => Boolean(p)),
    [references],
  );

  useEffect(() => {
    if (paths.length === 0) return;
    let active = true;
    void sign({ data: { paths } })
      .then((result) => {
        if (active) setUrls(result.urls);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [paths.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: characterKeys.list(projectId) });
    void queryClient.invalidateQueries({ queryKey: characterKeys.references(projectId) });
  };

  const generate = useMutation({
    mutationFn: () =>
      runImages({
        data: {
          characterId: character.id,
          kind,
          label: label.trim() || undefined,
          count: 3,
        },
      }),
    onSuccess: (result) => {
      invalidate();
      toast[result.isMock ? "warning" : "success"](
        result.isMock
          ? "Placeholder images created — no image provider is configured."
          : "Appearance options generated.",
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const save = useMutation({
    mutationFn: (patch: Partial<Character>) => updateCharacter(character, patch),
    onSuccess: () => {
      toast.success("Character saved");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <article className="panel rounded-xl border border-border p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">{character.name}</h2>
        <StatusBadge status={character.status} />
        {character.is_mock ? <MockBadge /> : null}
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          onClick={() => {
            void deleteCharacter(character.id).then(invalidate);
          }}
        >
          <Trash2 className="size-4" />
          Remove
        </Button>
      </div>

      <form
        className="mt-4 grid gap-4 md:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          save.mutate({
            name: String(form.get("name") ?? character.name),
            role: String(form.get("role") ?? ""),
            age_range: String(form.get("age_range") ?? ""),
            description: String(form.get("description") ?? ""),
            motivation: String(form.get("motivation") ?? ""),
            arc: String(form.get("arc") ?? ""),
            appearance_prompt: String(form.get("appearance_prompt") ?? ""),
          });
        }}
      >
        <div className="space-y-2">
          <Label>Name</Label>
          <Input name="name" defaultValue={character.name} />
        </div>
        <div className="space-y-2">
          <Label>Role</Label>
          <Input name="role" defaultValue={character.role ?? ""} placeholder="Protagonist" />
        </div>
        <div className="space-y-2">
          <Label>Age range</Label>
          <Input name="age_range" defaultValue={character.age_range ?? ""} />
        </div>
        <div className="space-y-2">
          <Label>Motivation</Label>
          <Input name="motivation" defaultValue={character.motivation ?? ""} />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label>Description</Label>
          <Textarea name="description" rows={3} defaultValue={character.description ?? ""} />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label>Narrative arc</Label>
          <Textarea name="arc" rows={2} defaultValue={character.arc ?? ""} />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label>Visual identity prompt</Label>
          <Textarea
            name="appearance_prompt"
            rows={2}
            defaultValue={character.appearance_prompt ?? ""}
            placeholder="Physical features, wardrobe, lighting — reused for every generated image."
          />
        </div>
        <div className="md:col-span-2">
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save profile"}
          </Button>
        </div>
      </form>

      <div className="mt-6 border-t border-border pt-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <Label>Reference type</Label>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as ReferenceKind)}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {REFERENCE_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-48 flex-1 space-y-2">
            <Label>Variation label (optional)</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Wedding outfit, episode 4"
            />
          </div>
          <Button onClick={() => generate.mutate()} disabled={generate.isPending}>
            {generate.isPending ? (
              <RefreshCw className="size-4 animate-spin" />
            ) : (
              <Images className="size-4" />
            )}
            {generate.isPending ? "Generating…" : "Generate 3 options"}
          </Button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {references.map((reference) => {
            const src = reference.storage_path ? urls[reference.storage_path] : reference.image_url;
            const approved = reference.id === character.approved_reference_id;
            return (
              <figure
                key={reference.id}
                className={`overflow-hidden rounded-lg border ${approved ? "border-emerald-500/60" : "border-border"}`}
              >
                {src ? (
                  <img src={src} alt={reference.label ?? character.name} className="aspect-[2/3] w-full object-cover" />
                ) : (
                  <div className="aspect-[2/3] w-full animate-pulse bg-secondary" />
                )}
                <figcaption className="space-y-1 p-2 text-xs">
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-muted-foreground">
                      {REFERENCE_KIND_LABELS[reference.kind]}
                    </span>
                    {reference.is_mock ? <MockBadge /> : null}
                  </div>
                  {reference.label ? <p className="truncate">{reference.label}</p> : null}
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={approved}
                      onClick={() => {
                        void approveReference(reference)
                          .then(invalidate)
                          .catch((error: Error) => toast.error(error.message));
                      }}
                    >
                      <Check className="size-3" />
                      {approved ? "Identity" : "Lock in"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={approved}
                      onClick={() => {
                        void deleteReference(reference.id)
                          .then(invalidate)
                          .catch((error: Error) => toast.error(error.message));
                      }}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                </figcaption>
              </figure>
            );
          })}
          {references.length === 0 ? (
            <p className="col-span-full text-sm text-muted-foreground">
              No reference images yet for this character.
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}
