import type { BaseModelConfig, Model } from "@strands-agents/sdk";
import { PolicyModel } from "./policy-model";

export type ModelProvider = "policy" | "bedrock" | "openai" | "anthropic";

export interface ResolvedModel {
  model: Model<BaseModelConfig>;
  provider: ModelProvider;
  modelId: string;
  /** True when no hosted LLM is configured and the deterministic policy is driving. */
  simulated: boolean;
  /**
   * True when a hosted LLM is deciding the agent's next move. The UI shows this
   * plainly so nobody has to guess whether they are watching reasoning or a
   * deterministic policy.
   */
  reasoning: boolean;
  /** Human-readable explanation, surfaced in the UI so the demo is never ambiguous. */
  note: string;
}

const DEFAULT_BEDROCK_MODEL = "global.anthropic.claude-sonnet-4-6";
const DEFAULT_OPENAI_MODEL = "gpt-5.2";
const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-6";

function bedrockConfigured(): boolean {
  return Boolean(
    process.env.AWS_BEARER_TOKEN_BEDROCK ||
      (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) ||
      process.env.AWS_PROFILE ||
      process.env.AWS_ROLE_ARN,
  );
}

/**
 * Choose the model backend.
 *
 * Order of precedence:
 *   1. OPENLOOP_MODEL (policy | bedrock | openai | anthropic) — explicit override
 *   2. Bedrock, when AWS credentials are present (the production target)
 *   3. OpenAI, when OPENAI_API_KEY is present
 *   4. Anthropic, when ANTHROPIC_API_KEY is present
 *   5. The deterministic policy engine — always available, no keys required
 */
export async function resolveModel(): Promise<ResolvedModel> {
  const requested = (process.env.OPENLOOP_MODEL ?? "auto").toLowerCase();
  const prefer = requested === "auto" ? undefined : (requested as ModelProvider);

  const choose: ModelProvider =
    prefer ??
    (bedrockConfigured()
      ? "bedrock"
      : process.env.OPENAI_API_KEY
        ? "openai"
        : process.env.ANTHROPIC_API_KEY
          ? "anthropic"
          : "policy");

  switch (choose) {
    case "bedrock": {
      const { BedrockModel } = await import("@strands-agents/sdk/models/bedrock");
      const modelId = process.env.BEDROCK_MODEL_ID ?? DEFAULT_BEDROCK_MODEL;
      return {
        model: new BedrockModel({ modelId, temperature: 0.2 }),
        provider: "bedrock",
        modelId,
        simulated: false,
        reasoning: true,
        note: "Next move decided by Amazon Bedrock — the production deployment target.",
      };
    }
    case "openai": {
      const { OpenAIModel } = await import("@strands-agents/sdk/models/openai");
      const modelId = process.env.OPENAI_MODEL_ID ?? DEFAULT_OPENAI_MODEL;
      return {
        model: new OpenAIModel({ modelId, temperature: 0.2, apiKey: process.env.OPENAI_API_KEY }),
        provider: "openai",
        modelId,
        simulated: false,
        reasoning: true,
        note: "Next move decided by OpenAI.",
      };
    }
    case "anthropic": {
      const { AnthropicModel } = await import("@strands-agents/sdk/models/anthropic");
      const modelId = process.env.ANTHROPIC_MODEL_ID ?? DEFAULT_ANTHROPIC_MODEL;
      return {
        model: new AnthropicModel({ modelId, temperature: 0.2, apiKey: process.env.ANTHROPIC_API_KEY }),
        provider: "anthropic",
        modelId,
        simulated: false,
        reasoning: true,
        note: "Next move decided by Anthropic.",
      };
    }
    case "policy":
    default: {
      const model = new PolicyModel();
      return {
        model,
        provider: "policy",
        modelId: model.getConfig().modelId ?? "openloop/policy-1",
        simulated: true,
        reasoning: false,
        note: "No LLM credentials are configured, so the agent's next move is chosen by a deterministic policy over tool output rather than by a language model. The Strands agent loop, the tools, the state, and the external world are all real. Set OPENLOOP_MODEL and provider credentials to switch the decision-making to an LLM.",
      };
    }
  }
}
