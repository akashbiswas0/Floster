import type { Diagnostic, Edge, WorkflowIR } from './types.js'

export interface GraphInfo {
  nodeIds: Set<string>
  outgoing: Map<string, string[]>
  incoming: Map<string, string[]>
}

export function buildGraph(ir: WorkflowIR): GraphInfo {
  const nodeIds = new Set<string>()
  for (const trigger of ir.triggers) nodeIds.add(trigger.id)
  for (const action of ir.actions) nodeIds.add(action.id)

  const outgoing = new Map<string, string[]>()
  const incoming = new Map<string, string[]>()

  for (const id of nodeIds) {
    outgoing.set(id, [])
    incoming.set(id, [])
  }

  for (const edge of ir.edges) {
    outgoing.get(edge.from)?.push(edge.to)
    incoming.get(edge.to)?.push(edge.from)
  }

  return { nodeIds, outgoing, incoming }
}

export function validateGraphTopology(ir: WorkflowIR): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const graph = buildGraph(ir)
  const triggerIds = new Set(ir.triggers.map((t) => t.id))
  const actionIds = new Set(ir.actions.map((a) => a.id))

  for (const edge of ir.edges) {
    if (!graph.nodeIds.has(edge.from)) {
      diagnostics.push({
        severity: 'error',
        code: 'GRAPH_UNKNOWN_FROM',
        message: `Edge.from references unknown node: ${edge.from}`,
      })
    }
    if (!graph.nodeIds.has(edge.to)) {
      diagnostics.push({
        severity: 'error',
        code: 'GRAPH_UNKNOWN_TO',
        message: `Edge.to references unknown node: ${edge.to}`,
      })
    }
    if (triggerIds.has(edge.to)) {
      diagnostics.push({
        severity: 'error',
        code: 'GRAPH_TRIGGER_TARGET',
        message: `Edges cannot point into trigger node '${edge.to}'.`,
      })
    }
    if (!actionIds.has(edge.to) && graph.nodeIds.has(edge.to)) {
      diagnostics.push({
        severity: 'error',
        code: 'GRAPH_TARGET_NOT_ACTION',
        message: `Edge target '${edge.to}' must be an action node.`,
      })
    }
  }

  for (const trigger of ir.triggers) {
    if ((graph.outgoing.get(trigger.id)?.length ?? 0) === 0) {
      diagnostics.push({
        severity: 'warning',
        code: 'GRAPH_TRIGGER_NO_CHAIN',
        message: `Trigger '${trigger.id}' is not wired to any action.`,
      })
    }
  }

  for (const action of ir.actions) {
    const inCount = graph.incoming.get(action.id)?.length ?? 0
    if (inCount === 0) {
      diagnostics.push({
        severity: 'warning',
        code: 'GRAPH_UNREACHABLE_ACTION',
        message: `Action '${action.id}' is not reachable from any trigger.`,
      })
    }
  }

  diagnostics.push(...detectCycles(ir.edges))

  return diagnostics
}

function detectCycles(edges: Edge[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const nodes = new Set<string>()
  const outgoing = new Map<string, string[]>()

  for (const { from, to } of edges) {
    nodes.add(from)
    nodes.add(to)
    if (!outgoing.has(from)) outgoing.set(from, [])
    outgoing.get(from)?.push(to)
    if (!outgoing.has(to)) outgoing.set(to, [])
  }

  const visiting = new Set<string>()
  const visited = new Set<string>()

  const dfs = (node: string): boolean => {
    if (visiting.has(node)) return true
    if (visited.has(node)) return false

    visiting.add(node)
    for (const child of outgoing.get(node) ?? []) {
      if (dfs(child)) return true
    }
    visiting.delete(node)
    visited.add(node)
    return false
  }

  for (const node of nodes) {
    if (dfs(node)) {
      diagnostics.push({
        severity: 'error',
        code: 'GRAPH_CYCLE',
        message: 'Workflow graph contains a cycle. Action chains must be acyclic.',
      })
      break
    }
  }

  return diagnostics
}

export function computeExecutionOrder(ir: WorkflowIR, triggerId: string): string[] {
  const graph = buildGraph(ir)
  const actionIds = new Set(ir.actions.map((a) => a.id))
  const visited = new Set<string>()
  const order: string[] = []

  const dfs = (node: string): void => {
    for (const next of graph.outgoing.get(node) ?? []) {
      if (!actionIds.has(next) || visited.has(next)) continue
      visited.add(next)
      dfs(next)
      order.push(next)
    }
  }

  dfs(triggerId)
  return order.reverse()
}
