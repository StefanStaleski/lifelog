"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { createPlace, PlaceInputSchema, PlacePatchSchema, updatePlace } from "@/lib/places";
import { getOwner } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

async function owner(): Promise<ActionResult | null> {
  return (await getOwner()) ? null : { ok: false, error: "Please sign in again." };
}

export async function savePlace(id: string | null, input: unknown): Promise<ActionResult> {
  const denied = await owner();
  if (denied) return denied;
  const parsed = (id ? PlacePatchSchema : PlaceInputSchema).safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the fields." };
  if (id) {
    if (!(await updatePlace(getDb(), id, parsed.data)))
      return { ok: false, error: "That place no longer exists." };
  } else {
    await createPlace(getDb(), parsed.data as never);
  }
  revalidatePath("/time");
  return { ok: true };
}

export async function setArchived(id: string, archived: boolean): Promise<ActionResult> {
  const denied = await owner();
  if (denied) return denied;
  await updatePlace(getDb(), id, { archived });
  revalidatePath("/time");
  return { ok: true };
}
