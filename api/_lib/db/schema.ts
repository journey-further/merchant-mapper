import { pgTable, uuid, text, jsonb, integer, timestamp, primaryKey } from 'drizzle-orm/pg-core'

// Tracks an uploaded feed file
export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  fileHash: text('file_hash').notNull().unique(),
  filename: text('filename').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

// Stores pipeline artifacts as JSON blobs keyed by (session, type)
// result_type values: 'raw' | 'combined' | 'gads'
export const sessionBlobs = pgTable('session_blobs', {
  sessionId: uuid('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  resultType: text('result_type').notNull(),
  data: jsonb('data').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.sessionId, t.resultType] }),
}))

// Parsed feed rows stored in Neon — replaces Vercel Blob JSON for row data.
// One row per product row; result_type matches BlobType ('raw' | 'combined' | 'gads').
export const feedRows = pgTable('feed_rows', {
  sessionId: uuid('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  resultType: text('result_type').notNull(),
  rowIndex: integer('row_index').notNull(),
  data: jsonb('data').notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.sessionId, t.resultType, t.rowIndex] }),
}))

// Per-session colour mapping overrides (supplements the base CSV)
export const colourMappings = pgTable('colour_mappings', {
  sessionId: uuid('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  productColour: text('product_colour').notNull(),
  genericColour: text('generic_colour').notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.sessionId, t.productColour] }),
}))
