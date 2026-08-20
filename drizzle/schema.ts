import { index, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/** Core account table provided by the authentication template. */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["owner", "admin", "user"]).default("user").notNull(),
  plan: mysqlEnum("plan", ["basic", "pro_max"]).default("basic").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const agentSettings = mysqlTable("agent_settings", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  ollamaUrl: varchar("ollamaUrl", { length: 512 }).notNull().default("http://localhost:11434"),
  activeModel: varchar("activeModel", { length: 160 }).notNull().default("llama3.2"),
  temperature: int("temperature").notNull().default(70),
  contextSize: int("contextSize").notNull().default(8192),
  systemPrompt: text("systemPrompt").notNull(),
  weatherEnabled: int("weatherEnabled").notNull().default(1),
  newsEnabled: int("newsEnabled").notNull().default(1),
  currencyEnabled: int("currencyEnabled").notNull().default(1),
  githubEnabled: int("githubEnabled").notNull().default(0),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const conversations = mysqlTable("conversations", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 180 }).notNull().default("Nova conversa"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [index("conversations_user_updated_idx").on(table.userId, table.updatedAt)]);

export const conversationMessages = mysqlTable("conversation_messages", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  role: mysqlEnum("role", ["user", "assistant", "system", "tool"]).notNull(),
  content: text("content").notNull(),
  attachmentUrl: varchar("attachmentUrl", { length: 1024 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [index("messages_conversation_created_idx").on(table.conversationId, table.createdAt)]);

export const memoryEntries = mysqlTable("memory_entries", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  conversationId: int("conversationId").references(() => conversations.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  sourceRole: mysqlEnum("sourceRole", ["user", "assistant", "tool"]).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [index("memory_user_created_idx").on(table.userId, table.createdAt)]);

export const apiCatalog = mysqlTable("api_catalog", {
  id: int("id").autoincrement().primaryKey(),
  slug: varchar("slug", { length: 96 }).notNull().unique(),
  name: varchar("name", { length: 160 }).notNull(),
  category: varchar("category", { length: 96 }).notNull(),
  baseUrl: varchar("baseUrl", { length: 512 }).notNull(),
  docsUrl: varchar("docsUrl", { length: 1024 }).notNull(),
  authKind: mysqlEnum("authKind", ["none", "api_key", "oauth", "custom"]).notNull().default("none"),
  approvalStatus: mysqlEnum("approvalStatus", ["catalog", "approved", "disabled"]).notNull().default("catalog"),
  minimumPlan: mysqlEnum("minimumPlan", ["basic", "pro_max"]).notNull().default("pro_max"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const apiCatalogSettings = mysqlTable("api_catalog_settings", {
  id: int("id").autoincrement().primaryKey(),
  apiId: int("apiId").notNull().unique().references(() => apiCatalog.id, { onDelete: "cascade" }),
  isEnabled: int("isEnabled").notNull().default(0),
  credentialReference: varchar("credentialReference", { length: 128 }),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const planModelAccess = mysqlTable("plan_model_access", {
  id: int("id").autoincrement().primaryKey(),
  plan: mysqlEnum("plan", ["basic", "pro_max"]).notNull(),
  modelName: varchar("modelName", { length: 160 }).notNull(),
  isEnabled: int("isEnabled").notNull().default(1),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [index("plan_model_access_plan_idx").on(table.plan)]);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type AgentSettings = typeof agentSettings.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type ConversationMessage = typeof conversationMessages.$inferSelect;
