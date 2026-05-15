import { z } from "zod";

// ── Serial ────────────────────────────────────────────────────────────────────

export const ConnectSerialSchema = z.object({
  port: z.string().min(1),
  baud: z.number().int().positive(),
});

export const SendSerialSchema = z.string().min(1);

// ── Execution ─────────────────────────────────────────────────────────────────

const StepSchema: z.ZodType<any> = z.lazy(() =>
  z.object({
    id: z.string(),
    type: z.string(),
    params: z.record(z.unknown()).default({}),
    steps: z.array(StepSchema).optional(),
    collapsed: z.boolean().optional(),
  })
);

const SignalEntrySchema = z.object({
  label: z.string(),
  color: z.string(),
  assignedApp: z.string().nullable(),
  assignedToButton: z.union([z.string(), z.array(z.string())]),
  steps: z.array(StepSchema),
  folderId: z.string().nullable().optional(),
  createdAt: z.number().optional(),
  runCount: z.number().optional(),
});

export const UpdateSignalMapSchema = z.record(SignalEntrySchema);

const VariableInfoSchema = z.object({
  value: z.unknown(),
  type: z.enum(["string", "int", "float", "bool", "list", "json", "any"]),
});

// Accept VariableInfo objects; fall back to unknown for legacy raw values
export const UpdateGlobalVarsSchema = z.record(z.union([VariableInfoSchema, z.unknown()]));

export const TestSequenceSchema = z.string().min(1);

// ── Region Selection ──────────────────────────────────────────────────────────

export const RegionRectSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().positive().finite(),
  height: z.number().positive().finite(),
});

// ── Themes & Files ────────────────────────────────────────────────────────────

export const ThemeIdSchema = z.string().min(1);

export const FilePathSchema = z.string().min(1);

// ── Media ─────────────────────────────────────────────────────────────────────

export const MultimediaActionSchema = z.enum([
  "play-pause",
  "siguiente",
  "anterior",
  "mute",
]);

// ── Persistence ───────────────────────────────────────────────────────────────

export const ExportSingleWorkflowSchema = z.object({
  name: z.string().min(1),
  data: z.unknown(),
});

export const ExportFolderSchema = z.object({
  folderName: z.string().min(1),
  workflows: z.array(z.unknown()),
});
