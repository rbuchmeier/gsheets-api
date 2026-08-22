import { z } from 'zod';
import { ApiError } from './errors.js';

export const OPS = ['read', 'append', 'update', 'delete'] as const;
export type Op = (typeof OPS)[number];

const registrationSchema = z.object({
  slug: z
    .string()
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      'slug must be lowercase alphanumeric with hyphens (e.g. "my-sheet")',
    ),
  sheetId: z.string().min(1),
  title: z.string().min(1),
  ops: z.array(z.enum(OPS)).nonempty(),
});

export type SheetRegistration = z.infer<typeof registrationSchema>;

export class Registry {
  private bySlug: Map<string, SheetRegistration>;

  constructor(registrations: SheetRegistration[]) {
    const parsed = z.array(registrationSchema).parse(registrations);
    this.bySlug = new Map();
    for (const reg of parsed) {
      if (this.bySlug.has(reg.slug)) {
        throw new Error(`Duplicate slug in sheets.config.ts: "${reg.slug}"`);
      }
      this.bySlug.set(reg.slug, reg);
    }
  }

  list(): SheetRegistration[] {
    return [...this.bySlug.values()];
  }

  /** Resolve a slug or throw a 404 ApiError. */
  resolve(slug: string): SheetRegistration {
    const reg = this.bySlug.get(slug);
    if (!reg) {
      throw new ApiError('not_found', `No registered sheet with slug "${slug}"`);
    }
    return reg;
  }

  /** Assert the sheet allows the operation or throw a 403 ApiError. */
  assertOp(reg: SheetRegistration, op: Op): void {
    if (!reg.ops.includes(op)) {
      throw new ApiError('forbidden', `Sheet "${reg.slug}" does not allow the "${op}" operation`);
    }
  }
}
