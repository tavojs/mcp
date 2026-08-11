import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  buildFeatureArgsSchema,
  chooseComponentsArgsSchema,
  diagnoseProjectArgsSchema,
} from "../schemas/prompts.js";

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "build-tavo-feature",
    {
      title: "Build a Tavo.js feature",
      description:
        "A safe research, inspection, implementation, and verification workflow.",
      argsSchema: buildFeatureArgsSchema,
    },
    ({ goal, target }) => ({
      description: `Build a Tavo.js feature: ${goal}`,
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Goal: ${goal}${target ? `\nTarget: ${target}` : ""}\nSearch the Tavo.js documentation first. If project tools are available, get task context and inspect relevant targets. Implement with the host's editing tools, then finish with Tavo.js verification. Do not use React APIs unless the public Tavo.js documentation explicitly requires them.`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "choose-tavo-ui-components",
    {
      title: "Choose Tavo.js UI components",
      description:
        "Select accessible Tavo.js UI components for a product interface.",
      argsSchema: chooseComponentsArgsSchema,
    },
    ({ interface: interfaceGoal }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Choose Tavo.js UI components for: ${interfaceGoal}\nUse find_tavo_components, prefer focused public imports, explain composition, and include relevant accessibility guidance.`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "diagnose-tavo-project",
    {
      title: "Diagnose a Tavo.js project",
      description:
        "Inspect and verify a Tavo.js application without changing it.",
      argsSchema: diagnoseProjectArgsSchema,
    },
    ({ symptom }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Diagnose this Tavo.js project symptom: ${symptom}\nGet project context, inspect the smallest relevant target, run scoped verification, and report evidence-backed findings. Do not modify files.`,
          },
        },
      ],
    }),
  );
}
