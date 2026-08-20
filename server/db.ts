import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  agentSettings,
  apiCatalog,
  apiCatalogSettings,
  conversationMessages,
  conversations,
  InsertUser,
  memoryEntries,
  planModelAccess,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

function defaultSystemPrompt() {
  return "Você é um agente local útil, preciso e transparente. Use somente as ferramentas autorizadas pelo usuário e cite limitações quando uma informação não puder ser verificada.";
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  return db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId, lastSignedIn: user.lastSignedIn ?? new Date() };
  const updateSet: Record<string, unknown> = { lastSignedIn: values.lastSignedIn };
  (["name", "email", "loginMethod"] as const).forEach((field) => {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  });
  if (user.openId === ENV.ownerOpenId) {
    values.role = "owner";
    updateSet.role = "owner";
    values.plan = "pro_max";
    updateSet.plan = "pro_max";
  } else if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  }
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function getOrCreateAgentSettings(userId: number) {
  const db = await requireDb();
  const existing = await db.select().from(agentSettings).where(eq(agentSettings.userId, userId)).limit(1);
  if (existing[0]) return existing[0];
  await db.insert(agentSettings).values({
    userId,
    systemPrompt: defaultSystemPrompt(),
    newsEnabled: 0,
    currencyEnabled: 0,
  });
  const created = await db.select().from(agentSettings).where(eq(agentSettings.userId, userId)).limit(1);
  if (!created[0]) throw new Error("Não foi possível criar as configurações do agente.");
  return created[0];
}

export async function updateAgentSettings(
  userId: number,
  settings: {
    ollamaUrl: string;
    activeModel: string;
    temperature: number;
    contextSize: number;
    systemPrompt: string;
    weatherEnabled: number;
    newsEnabled: number;
    currencyEnabled: number;
    githubEnabled: number;
  },
) {
  const db = await requireDb();
  await getOrCreateAgentSettings(userId);
  await db.update(agentSettings).set({ ...settings, updatedAt: new Date() }).where(eq(agentSettings.userId, userId));
  return getOrCreateAgentSettings(userId);
}

export async function listConversations(userId: number) {
  const db = await requireDb();
  return db.select().from(conversations).where(eq(conversations.userId, userId)).orderBy(desc(conversations.updatedAt));
}

export async function createConversation(userId: number, title: string) {
  const db = await requireDb();
  const result = await db.insert(conversations).values({ userId, title });
  const created = await db.select().from(conversations).where(eq(conversations.id, Number(result[0].insertId))).limit(1);
  if (!created[0]) throw new Error("Não foi possível criar a conversa.");
  return created[0];
}

export async function assertConversationOwner(userId: number, conversationId: number) {
  const db = await requireDb();
  const result = await db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1);
  const conversation = result[0];
  if (!conversation || conversation.userId !== userId) throw new Error("Conversa não encontrada ou sem permissão.");
  return conversation;
}

export async function listConversationMessages(userId: number, conversationId: number) {
  const db = await requireDb();
  await assertConversationOwner(userId, conversationId);
  return db.select().from(conversationMessages).where(eq(conversationMessages.conversationId, conversationId)).orderBy(conversationMessages.createdAt);
}

export async function appendConversationMessage(
  userId: number,
  conversationId: number,
  message: { role: "user" | "assistant" | "system" | "tool"; content: string; attachmentUrl?: string },
) {
  const db = await requireDb();
  await assertConversationOwner(userId, conversationId);
  const result = await db.insert(conversationMessages).values({ conversationId, ...message });
  await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, conversationId));
  const created = await db.select().from(conversationMessages).where(eq(conversationMessages.id, Number(result[0].insertId))).limit(1);
  if (!created[0]) throw new Error("Não foi possível salvar a mensagem.");
  return created[0];
}

export async function saveMemoryEntry(
  userId: number,
  conversationId: number,
  sourceRole: "user" | "assistant" | "tool",
  content: string,
) {
  const db = await requireDb();
  if (content.trim().length < 12) return;
  await db.insert(memoryEntries).values({ userId, conversationId, sourceRole, content: content.trim().slice(0, 4000) });
}

export async function listMemoryEntries(userId: number) {
  const db = await requireDb();
  return db.select().from(memoryEntries).where(eq(memoryEntries.userId, userId)).orderBy(desc(memoryEntries.createdAt)).limit(80);
}

export async function listApiCatalog() {
  const db = await requireDb();
  return db.select({
    id: apiCatalog.id,
    slug: apiCatalog.slug,
    name: apiCatalog.name,
    category: apiCatalog.category,
    baseUrl: apiCatalog.baseUrl,
    docsUrl: apiCatalog.docsUrl,
    authKind: apiCatalog.authKind,
    approvalStatus: apiCatalog.approvalStatus,
    minimumPlan: apiCatalog.minimumPlan,
    isEnabled: apiCatalogSettings.isEnabled,
    credentialReference: apiCatalogSettings.credentialReference,
  }).from(apiCatalog).leftJoin(apiCatalogSettings, eq(apiCatalog.id, apiCatalogSettings.apiId)).orderBy(apiCatalog.name);
}

export async function updateCatalogSetting(apiId: number, isEnabled: number, credentialReference?: string | null) {
  const db = await requireDb();
  await db.insert(apiCatalogSettings).values({ apiId, isEnabled, credentialReference: credentialReference ?? null }).onDuplicateKeyUpdate({
    set: { isEnabled, credentialReference: credentialReference ?? null, updatedAt: new Date() },
  });
  return listApiCatalog();
}

export async function listPlanModels() {
  const db = await requireDb();
  return db.select().from(planModelAccess).orderBy(planModelAccess.plan, planModelAccess.modelName);
}

export async function listEnabledModelsForPlan(plan: "basic" | "pro_max") {
  const db = await requireDb();
  const rows = await db.select().from(planModelAccess).where(eq(planModelAccess.plan, plan));
  return rows.filter((row) => Boolean(row.isEnabled)).map((row) => row.modelName);
}

export async function upsertPlanModel(plan: "basic" | "pro_max", modelName: string, isEnabled: number) {
  const db = await requireDb();
  const existing = await db.select().from(planModelAccess).where(eq(planModelAccess.modelName, modelName));
  const match = existing.find((row) => row.plan === plan);
  if (match) {
    await db.update(planModelAccess).set({ isEnabled, updatedAt: new Date() }).where(eq(planModelAccess.id, match.id));
  } else {
    await db.insert(planModelAccess).values({ plan, modelName, isEnabled });
  }
  return listPlanModels();
}

export async function listUsersForOwner() {
  const db = await requireDb();
  return db.select({
    id: users.id,
    name: users.name,
    email: users.email,
    role: users.role,
    plan: users.plan,
    lastSignedIn: users.lastSignedIn,
    createdAt: users.createdAt,
  }).from(users).orderBy(desc(users.lastSignedIn));
}

export async function updateUserAccess(userId: number, role: "admin" | "user", plan: "basic" | "pro_max") {
  const db = await requireDb();
  await db.update(users).set({ role, plan }).where(eq(users.id, userId));
  const updated = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return updated[0];
}
