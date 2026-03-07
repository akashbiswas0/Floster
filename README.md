# Floster

Floster is a visual workflow automation platform that lets you build, simulate the on-chain and off-chain workflows using a drag-and-drop nodes. Connect triggers, actions, and smart contract interactions including ERC20 transfers, HTTP requests, confidential compute, and x402 payments, all without writing complex orchestration code.

---

**Chainlink CRE Usage links:**
- [Simulation engine](https://github.com/akashbiswas0/Floster/tree/main/src/simulation)
- [Smart contracts](https://github.com/akashbiswas0/Floster/tree/main/contracts)
- [Workflow compiler / code generator](https://github.com/akashbiswas0/Floster/blob/main/src/compiler/templates.ts)

---

## Chainlink Usage

This project uses **Chainlink CRE** (Chainlink Runtime Environment) as the core workflow execution engine. Below are all files in the repo that directly use Chainlink:

### Workflow Compiler & Code Generation

| File | What it does |
|---|---|
| [`src/compiler/templates.ts`](./src/compiler/templates.ts) | Core code generator, imports `@chainlink/cre-sdk` and emits executable CRE workflow TypeScript. Uses `cre.capabilities.HTTPClient` (HTTP fetch), `cre.capabilities.EVMClient` (on chain reads and ERC20 transfers), `ConfidentialHTTPClient` (encrypted HTTP via TEE), `cre.capabilities.CronCapability` + `HTTPCapability` + `logTrigger` (all three trigger types), and `cre.handler` to wire triggers to workflow handlers. Also generates the `package.json` with `@chainlink/cre-sdk: ^1.1.2` and the `cre-compile` build script for each exported workflow |
| [`src/compiler/index.ts`](./src/compiler/index.ts) | Detects whether a workflow contains an `erc20Transfer` action to determine if `CRE_ETH_PRIVATE_KEY` is required before simulation |

### CRE Simulation Engine

| File | What it does |
|---|---|
| [`src/simulation/index.ts`](./src/simulation/index.ts) | Invokes the `cre` CLI binary to compile and simulate workflows locally, bootstraps `@chainlink/cre-sdk-javy-plugin` (creates the `javy-chainlink-sdk.plugin.wasm` symlink), runs `cre-compile`, and streams `cre workflow simulate` output |
| [`src/simulation/onboarding.ts`](./src/simulation/onboarding.ts) | Pre flight checks for CRE simulation, verifies the `cre` CLI is installed and authenticated, validates `CRE_ETH_PRIVATE_KEY` is present in `.env` for ERC20 transfer workflows |
| [`src/simulation/integration.test.ts`](./src/simulation/integration.test.ts) | Integration tests for the CRE simulation pipeline, tests auto install of `cre-compile`, `CRE_ETH_PRIVATE_KEY` enforcement for `erc20Transfer` workflows, and fake `cre` binary scaffolding |

### Smart Contracts (CRE Receiver)

| File | What it does |
|---|---|
| [`contracts/src/ERC20TransferReceiver.sol`](./contracts/src/ERC20TransferReceiver.sol) | Solidity contract that implements the CRE `IReceiver` interface, validates the Chainlink Forwarder address via `onlyForwarder`, decodes and executes ERC20 transfers on-chain when triggered by a CRE `onReport()` call |
| [`contracts/test/ERC20TransferReceiver.t.sol`](./contracts/test/ERC20TransferReceiver.t.sol) | Foundry test suite for `ERC20TransferReceiver`, tests `onReport` execution, `IReceiver` interface support, and Forwarder-only access control |
| [`contracts/evm/src/abi/ERC20TransferReceiver.abi`](./contracts/evm/src/abi/ERC20TransferReceiver.abi) | ABI for `ERC20TransferReceiver` : used by the compiler to ABI encode the `transferToken` call passed to `onReport` |

### Domain Layer (IR Schema & Validation)

| File | What it does |
|---|---|
| [`src/domain/types.ts`](./src/domain/types.ts) | TypeScript type definitions, defines `Erc20TransferActionNode` (token address, receiver contract, recipient, amount path, gas limit) and includes it in the `ActionNode` union type |
| [`src/domain/targets.ts`](./src/domain/targets.ts) | Hardcodes the Chainlink Forwarder contract addresses: `SEPOLIA_SIMULATION_FORWARDER = 0x15fC6ae953E024d975e77382eEeC56A9101f9F88` and `SEPOLIA_PRODUCTION_FORWARDER = 0xF8344CFd5c43616a4366C34E3EEE75af79a74482` used to configure the deployed receiver contract |
| [`src/domain/schema.ts`](./src/domain/schema.ts) | JSON Schema for workflow IR validation, includes the `erc20Transfer` action shape with required CRE fields |
| [`src/domain/lint.ts`](./src/domain/lint.ts) | Workflow linter : flags `erc20Transfer` and `evmWrite` actions that are missing chain/network config required for CRE execution |
| [`src/domain/normalize.ts`](./src/domain/normalize.ts) | Normalizes legacy `evmPayoutTransfer` nodes to the canonical `erc20Transfer` shape before compilation |

### AI Prompt Layer

| File | What it does |
|---|---|
| [`src/ai/prompts.ts`](./src/ai/prompts.ts) | System prompt for the AI workflow generator, explicitly instructs the LLM to output **Chainlink CRE** workflow JSON, documents the `erc20Transfer` action schema, and includes a worked example of an HTTP webhook that reads a Chainlink price feed contract |
| [`src/ai/template-snippets.ts`](./src/ai/template-snippets.ts) | AI template snippet library, includes a "Scheduled Chainlink price feed read" snippet that describes using on chain Chainlink price feed contracts as a CRE data source |

### UI Layer (Canvas & IR Helpers)

| File | What it does |
|---|---|
| [`src/ui-react/components/NodePalette.tsx`](./src/ui-react/components/NodePalette.tsx) | Drag-and-drop node palette : exposes `ERC20 Transfer` as a first class CRE action node users can add to the workflow canvas |
| [`src/ui-react/lib/nodeHelpers.ts`](./src/ui-react/lib/nodeHelpers.ts) | Creates default `erc20Transfer` node config (chain, token address, receiver contract, recipient, amount path, gas limit) when a user drops the node onto the canvas |
| [`src/ui-react/lib/irHelpers.ts`](./src/ui-react/lib/irHelpers.ts) | Converts between canvas node state and CRE IR, serialises/deserialises `erc20Transfer` fields for the workflow JSON |
| [`src/ui-react/lib/api.ts`](./src/ui-react/lib/api.ts) | Frontend API client : extracts the `receiverContract` from `erc20Transfer` actions in the IR and passes it as the broadcast config when calling the simulation endpoint |

---

## Running the Application

### Prerequisites

- **Node.js** v18 or later
- **[cre CLI](https://docs.chain.link/chainlink-automation/reference/automation-contracts)** — required for workflow simulation (`cre workflow simulate`)
- **[Foundry](https://getfoundry.sh)** (`forge`) — required only for running smart contract tests

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Create a `.env` file in the project root:

```bash
# Required for AI workflow generation
OPENROUTER_API_KEY=your_openrouter_api_key

# Required for workflows that include an ERC20 Transfer action
CRE_ETH_PRIVATE_KEY=your_eth_private_key

# Optional — defaults to 4173
PORT=4173
```

### 3. Start the development server

```bash
npm run dev
```

This starts the Express + Vite dev server with hot module replacement. Open [http://localhost:4173](http://localhost:4173) in your browser.

### 4. Production build & start

```bash
npm run build:ui   # compile the React frontend with Vite
npm run build      # compile the server TypeScript
npm run start      # run the compiled server from dist/
```

### Running tests

```bash
# Unit & integration tests (Vitest)
npm test

# Watch mode
npm run test:watch

# Solidity contract tests (requires forge)
npm run test:contracts
```

---

## Running the Demo APIs

The `demo-apis/` folder contains two lightweight Express servers you can run locally to feed live data into your workflows during testing.

### Attendance API (`demo-apis/attendance-api`)

Returns a list of employees with randomised attendance percentages and calculated salaries. Useful for testing payroll/ERC20 payout workflows.

**Default port:** `3000`  
**Endpoint:** `GET /api/employees`

```bash
cd demo-apis/attendance-api
npm install
npm start          # node index.js  — or —
npm run dev        # nodemon (auto-restart on file changes)
```

Example response:

```json
[
  {
    "id": "E001",
    "name": "Alice Johnson",
    "wallet": "0xf3D8a5912f381Da9949fc0c8393734F173A96B72",
    "attendancePercentage": 87.45,
    "totalMonthlySalary": 1224.3
  }
]
```

### Random Number API (`demo-apis/backend`)

Returns a single random decimal number between `0.000001` and `0.009999`. Useful for testing workflows that consume a numeric data feed.

**Default port:** `3002`  
**Endpoint:** `GET /random`

```bash
cd demo-apis/backend
npm install
npm start
```

Example response:

```json
{ "number": 0.004731 }
```

### Running both APIs at the same time

Open two terminal tabs and start each server independently as shown above, or use a tool like `concurrently` (already a dev dependency in the root):

```bash
# From the project root
npx concurrently \
  "cd demo-apis/attendance-api && node index.js" \
  "cd demo-apis/backend && node index.js"
```
