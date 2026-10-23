import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import {
  GetVillaAppStateResponse,
  UpdateVillaAppStateBody,
  UpdateVillaAppStateResponse,
} from "@workspace/api-zod";
import { db, villaAppStateTable } from "@workspace/db";
import { requireAllowedEmail } from "../middlewares/requireAllowedEmail";

const router: IRouter = Router();
const STATE_ID = "villa-payroll-manager";

async function loadOrCreateStateRow() {
  await db
    .insert(villaAppStateTable)
    .values({ id: STATE_ID, payload: null, revision: 0 })
    .onConflictDoNothing({ target: villaAppStateTable.id });

  const [row] = await db
    .select()
    .from(villaAppStateTable)
    .where(eq(villaAppStateTable.id, STATE_ID))
    .limit(1);

  if (!row) {
    throw new Error("Shared state row could not be loaded.");
  }

  return row;
}

function toResponse(row: Awaited<ReturnType<typeof loadOrCreateStateRow>>) {
  const result =
    row.payload === null
      ? { initialized: false, revision: row.revision }
      : {
          initialized: true,
          revision: row.revision,
          data: row.payload,
        };

  return GetVillaAppStateResponse.parse(result);
}

router.use(requireAllowedEmail);

router.get("/app-state", async (req, res) => {
  try {
    res.json(toResponse(await loadOrCreateStateRow()));
  } catch {
    req.log.error("Could not load shared payroll state.");
    res.status(500).json({ error: "Shared records could not be loaded." });
  }
});

router.put("/app-state", async (req, res) => {
  const parsed = UpdateVillaAppStateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "The shared records format is invalid." });
    return;
  }

  try {
    await loadOrCreateStateRow();
    const [updated] = await db
      .update(villaAppStateTable)
      .set({
        payload: parsed.data.data,
        revision: parsed.data.revision + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(villaAppStateTable.id, STATE_ID),
          eq(villaAppStateTable.revision, parsed.data.revision),
        ),
      )
      .returning();

    if (updated) {
      res.json(
        UpdateVillaAppStateResponse.parse({
          initialized: true,
          revision: updated.revision,
          data: updated.payload,
        }),
      );
      return;
    }

    const current = toResponse(await loadOrCreateStateRow());
    res.status(409).json({
      error: "A newer shared revision already exists.",
      current,
    });
  } catch {
    req.log.error("Could not save shared payroll state.");
    res.status(500).json({ error: "Shared records could not be saved." });
  }
});

export default router;
