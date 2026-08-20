export type AccountRole = "owner" | "admin" | "user";
export type AccountPlan = "basic" | "pro_max";

export function isOwner(role: AccountRole) {
  return role === "owner";
}

export function isProMax(plan: AccountPlan) {
  return plan === "pro_max";
}

export function permittedContextSize(plan: AccountPlan, requested: number) {
  return Math.min(requested, isProMax(plan) ? 131072 : 8192);
}

export function toolIsAvailable(plan: AccountPlan, tool: "clima" | "notícias" | "câmbio") {
  return tool === "clima" || isProMax(plan);
}
