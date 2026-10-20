import MonkeyError from "../utils/error";
import { getDb } from "../init/sql";
import { EditPresetRequest, Preset } from "@monkeytype/schemas/presets";
import { ConfigGroupName, PartialConfig } from "@monkeytype/schemas/configs";
import { isUuid } from "../utils/misc";

const MAX_PRESETS = 10;

export type DBConfigPreset = Preset & { uid: string };

type PresetCreationResult = {
  presetId: string;
};

type PresetRow = {
  id: string;
  uid: string;
  name: string;
  config: PartialConfig;
  setting_groups: ConfigGroupName[] | null;
};

function toPreset(row: PresetRow): DBConfigPreset {
  return {
    _id: row.id,
    uid: row.uid,
    name: row.name,
    config: row.config,
    settingGroups: row.setting_groups,
  };
}

export async function getPresets(uid: string): Promise<DBConfigPreset[]> {
  const sql = getDb();
  const rows = (await sql`
    select id, uid, name, config, setting_groups from presets
    where uid = ${uid}
    order by name asc
  `) as PresetRow[];

  return rows.map(toPreset);
}

export async function addPreset(
  uid: string,
  preset: Omit<Preset, "_id">,
): Promise<PresetCreationResult> {
  const sql = getDb();

  const counted =
    await sql`select count(*)::int as count from presets where uid = ${uid}`;
  if (((counted[0]?.["count"] as number) ?? 0) >= MAX_PRESETS) {
    throw new MonkeyError(409, "Too many presets");
  }

  const rows = await sql`
    insert into presets (uid, name, config, setting_groups)
    values (
      ${uid},
      ${preset.name},
      ${JSON.stringify(preset.config ?? {})}::jsonb,
      ${preset.settingGroups ?? null}
    )
    returning id
  `;

  return { presetId: rows[0]?.["id"] as string };
}

export async function editPreset(
  uid: string,
  preset: EditPresetRequest,
): Promise<void> {
  if (!isUuid(preset._id)) return;

  const sql = getDb();
  const keepConfig =
    preset.config === undefined ||
    preset.config === null ||
    Object.keys(preset.config).length === 0;

  if (keepConfig) {
    await sql`
      update presets
      set name = ${preset.name}, setting_groups = ${preset.settingGroups ?? null}
      where id = ${preset._id} and uid = ${uid}
    `;
    return;
  }

  await sql`
    update presets set
      name = ${preset.name},
      setting_groups = ${preset.settingGroups ?? null},
      config = ${JSON.stringify(preset.config)}::jsonb
    where id = ${preset._id} and uid = ${uid}
  `;
}

export async function removePreset(
  uid: string,
  presetId: string,
): Promise<void> {
  if (!isUuid(presetId)) throw new MonkeyError(404, "Preset not found");

  const sql = getDb();
  const rows = await sql`
    delete from presets where id = ${presetId} and uid = ${uid} returning id
  `;

  if (rows.length === 0) {
    throw new MonkeyError(404, "Preset not found");
  }
}

export async function deleteAllPresets(uid: string): Promise<void> {
  const sql = getDb();
  await sql`delete from presets where uid = ${uid}`;
}
