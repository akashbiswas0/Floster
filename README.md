# Floster

Floster is a visual workflow automation platform that lets you build, simulate the on-chain and off-chain workflows using a drag-and-drop nodes. Connect triggers, actions, and smart contract interactions including ERC20 transfers, HTTP requests, confidential compute, and x402 payments, all without writing complex orchestration code.

---

**Chainlink CRE Usage links:**
- [Simulation engine](https://github.com/akashbiswas0/Floster/tree/main/src/simulation)
- [Smart contracts](https://github.com/akashbiswas0/Floster/tree/main/contracts)
- [Workflow compiler / code generator](https://github.com/akashbiswas0/Floster/blob/main/src/compiler/templates.ts)

---

## How it works

1. **Build** — drag triggers (cron, HTTP webhook, on-chain log) and actions (HTTP fetch, ERC20 transfer, confidential compute, x402 payment) onto the canvas and wire them together.
2. **Compile** — the workflow graph is converted to a typed intermediate representation (IR) and then code-generated into executable Chainlink CRE TypeScript via `@chainlink/cre-sdk`.
3. **Simulate** — the compiled workflow is run locally using the `cre` CLI, streaming live output back to the UI.

---

## Core Components

| Component | Location | Role |
|---|---|---|
| Visual Canvas | `src/ui-react/` | Drag-and-drop workflow builder (React + ReactFlow) |
| Compiler | `src/compiler/` | Converts workflow IR → executable CRE TypeScript |
| Simulation Engine | `src/simulation/` | Runs `cre workflow simulate` locally and streams output |
| Domain / IR | `src/domain/` | Schema, validation, linting, and type definitions |
| Smart Contracts | `contracts/` | `ERC20TransferReceiver` — CRE `IReceiver` on-chain handler |
| AI Assistant | `src/ai/` | LLM-powered workflow generation from natural language |


