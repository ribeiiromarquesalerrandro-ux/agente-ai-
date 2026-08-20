import { permittedContextSize } from "./access";

export type AgentPreferenceInput = {
  activeModel: string;
  contextSize: number;
  newsEnabled: boolean;
  currencyEnabled: boolean;
  githubEnabled: boolean;
};

export function normalizeAgentPreferences(
  plan: "basic" | "pro_max",
  owner: boolean,
  allowedModels: string[],
  preferences: AgentPreferenceInput,
) {
  if (!allowedModels.includes(preferences.activeModel)) {
    throw new Error("Esse modelo não foi liberado pelo owner para seu plano.");
  }
  const proMax = plan === "pro_max";
  return {
    activeModel: preferences.activeModel,
    contextSize: permittedContextSize(plan, preferences.contextSize),
    newsEnabled: proMax && preferences.newsEnabled,
    currencyEnabled: proMax && preferences.currencyEnabled,
    githubEnabled: owner && proMax && preferences.githubEnabled,
  };
}
