import { useState, useCallback } from 'react'
import type { WorkflowIR, NodePosition } from './types/workflow'
import { defaultIR, normalizeLocalIR, ensureRuntimeTargets, buildDefaultTargets } from './lib/irHelpers'
import { allNodes, makeNode, isTriggerType } from './lib/nodeHelpers'
import { postJSON, formatSimulationResponse, getSimulationMeta } from './lib/api'
import Sidebar from './components/Sidebar'
import Topbar from './components/Topbar'
import CanvasToolbar from './components/CanvasToolbar'
import WorkflowCanvas from './components/WorkflowCanvas'
import BottomPanels from './components/BottomPanels'
import NodeInputPanel from './components/NodeInputPanel'

export default function App() {
  const [ir, setIr] = useState<WorkflowIR>(() => normalizeLocalIR(structuredClone(defaultIR)))
  const [nodePositions, setNodePositions] = useState<Map<string, NodePosition>>(new Map())
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [output, setOutput] = useState('')
  const [isSimulating, setIsSimulating] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')

  const simulationTarget = ir.runtime.defaultTarget || 'local-simulation'
  const nodes = allNodes(ir)
  const nodeIds = nodes.map((n) => n.id)


  function writeOutput(title: string, data: unknown) {
    setOutput(`${title}\n\n${typeof data === 'string' ? data : JSON.stringify(data, null, 2)}`)
  }

  function getModeInfo() {
    const target = simulationTarget
    if (target === 'sepolia-broadcast') return { label: 'Broadcast · Sepolia', dotColor: '#00e5a0' }
    if (target === 'sepolia-production') return { label: 'Production · Sepolia', dotColor: '#ffb547' }
    return { label: 'Dry Run · Sepolia', dotColor: '#00d4ff' }
  }

  function getSelectionText() {
    const node = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) : null
    return node
      ? `Selected ${node.id} (${node.type})`
      : 'Select a node and connect using Edge controls.'
  }

  const handleAddNode = useCallback((type: string) => {
    setIr((prev) => {
      const count = allNodes(prev).length
      const meta = getSimulationMeta(prev, prev.runtime.defaultTarget)
      const node = makeNode(type, count, meta.receiverContract, prev.actions)
      setNodePositions((pos) => {
        const next = new Map(pos)
        next.set(node.id, { x: 40 + (count % 4) * 210, y: 60 + Math.floor(count / 4) * 120 })
        return next
      })
      const next = structuredClone(prev)
      if (isTriggerType(type)) next.triggers.push(node)
      else next.actions.push(node)
      return next
    })
  }, [])

  const handleDropNode = useCallback((type: string, x: number, y: number) => {
    setIr((prev) => {
      const count = allNodes(prev).length
      const meta = getSimulationMeta(prev, prev.runtime.defaultTarget)
      const node = makeNode(type, count, meta.receiverContract, prev.actions)
      setNodePositions((pos) => {
        const next = new Map(pos)
        next.set(node.id, { x, y })
        return next
      })
      const next = structuredClone(prev)
      if (isTriggerType(type)) next.triggers.push(node)
      else next.actions.push(node)
      return next
    })
  }, [])

  const handleFieldChange = useCallback((nodeId: string, key: string, value: string | number) => {
    setIr((prev) => {
      const next = structuredClone(prev)
      const node =
        next.triggers.find((n) => n.id === nodeId) || next.actions.find((n) => n.id === nodeId)
      if (node) node[key] = value
      return next
    })
  }, [])

  function handleSimulationTargetChange(target: string) {
    setIr((prev) => {
      const next = structuredClone(prev)
      next.runtime = ensureRuntimeTargets(next.runtime)
      next.runtime.defaultTarget = target
      const receiver = next.runtime.targets[target]?.receiverContract || ''
      for (const action of next.actions) {
        if (action.type === 'erc20Transfer') action.receiverContract = receiver
      }
      return next
    })
  }

  const handleAddEdge = useCallback((from: string, to: string, fromSide: 'left' | 'right', toSide: 'left' | 'right') => {
    if (!from || !to) return
    setIr((prev) => {
      const next = structuredClone(prev)
      if (next.edges.some((e) => e.from === from && e.to === to && (e.fromSide ?? 'right') === fromSide && (e.toSide ?? 'left') === toSide)) return prev
      next.edges.push({ from, to, fromSide, toSide })
      return next
    })
  }, [])

  const handleDeleteNode = useCallback((id: string) => {
    setIr((prev) => {
      const next = structuredClone(prev)
      next.triggers = next.triggers.filter((n) => n.id !== id)
      next.actions = next.actions.filter((n) => n.id !== id)
      next.edges = next.edges.filter((e) => e.from !== id && e.to !== id)
      return next
    })
    setNodePositions((pos) => {
      const next = new Map(pos)
      next.delete(id)
      return next
    })
    setSelectedNodeId((sel) => (sel === id ? null : sel))
  }, [])

  function handleIRJsonChange(value: string) {
    try {
      const parsed = normalizeLocalIR(JSON.parse(value))
      setIr(parsed)
    } catch {
    }
  }

  function checkNodesConnected(): boolean {
    const totalNodes = ir.triggers.length + ir.actions.length
    if (totalNodes >= 2 && ir.edges.length === 0) {
      writeOutput('Action blocked', 'Your workflow nodes are not connected.\n\nPlease connect the nodes using edges before running validate, generate files, or simulate.')
      return false
    }
    return true
  }

  async function handleValidate() {
    if (!checkNodesConnected()) return
    try {
      const res = await postJSON<{ ir?: unknown; diagnostics?: unknown[] }>('/api/validate', ir)
      if (res.ir) setIr(normalizeLocalIR(res.ir))
      writeOutput('Validation + preflight', res)
    } catch (err) {
      writeOutput('Validation failed', (err as Error).message)
    }
  }

  async function handleCompile() {
    if (!checkNodesConnected()) return
    try {
      const res = await postJSON('/api/compile', { ir })
      writeOutput('Compile success', res)
    } catch (err) {
      writeOutput('Compile failed', (err as Error).message)
    }
  }

  async function handleSimulate() {
    if (!checkNodesConnected()) return
    setIsSimulating(false)
    try {
      let validatedIR = ir
      try {
        const validateRes = await postJSON<{ ir?: unknown; diagnostics?: unknown[] }>('/api/validate', ir)
        if (validateRes.ir) {
          validatedIR = normalizeLocalIR(validateRes.ir)
          setIr(validatedIR)
        }
        writeOutput('Step 1 · Validate + Preflight', validateRes)
        const diags = (validateRes.diagnostics ?? []) as Array<{ severity: string; message: string }>
        const errors = diags.filter((d) => d.severity === 'error')
        if (errors.length > 0) return
      } catch (err) {
        writeOutput('Step 1 · Validation failed', (err as Error).message)
        return
      }

      await new Promise((r) => setTimeout(r, 1000))

      try {
        const compileRes = await postJSON('/api/compile', { ir: validatedIR })
        writeOutput('Step 2 · Generate Files', compileRes)
      } catch (err) {
        writeOutput('Step 2 · Compile failed', (err as Error).message)
        return
      }

      await new Promise((r) => setTimeout(r, 2000))

      setIsSimulating(true)
      const meta = getSimulationMeta(validatedIR, simulationTarget)
      const res = await postJSON('/api/simulate', {
        ir: validatedIR,
        autoCompile: true,
        workflowPath: './generated/' + validatedIR.metadata.name,
        target: meta.target,
        broadcast: meta.broadcast,
        triggerInput: validatedIR.triggers[0]?.type === 'http'
          ? { mode: 'http', triggerIndex: 0, payload: {} }
          : { mode: 'cron', triggerIndex: 0 },
      })
      writeOutput('Step 3 · Simulation', formatSimulationResponse(res, meta))
    } catch (err) {
      writeOutput('Simulation failed', (err as Error).message)
    } finally {
      setIsSimulating(false)
    }
  }

  async function handleRepair() {
    try {
      const validated = await postJSON<{ diagnostics?: unknown[] }>('/api/validate', ir).catch((e) => {
        return JSON.parse(String((e as Error).message))
      })
      const res = await postJSON<{ ir: unknown }>('/api/ai/repair', {
        ir,
        diagnostics: (validated as { diagnostics?: unknown[] }).diagnostics || [],
      })
      setIr(normalizeLocalIR(res.ir))
      writeOutput('AI repair', res)
    } catch (err) {
      writeOutput('AI repair failed', (err as Error).message)
    }
  }

  const handleGenerated = useCallback((generatedIR: WorkflowIR) => {
    const normalized = normalizeLocalIR(generatedIR)
    setIr(normalized)
    const allGeneratedNodes = [
      ...(generatedIR.triggers ?? []),
      ...(generatedIR.actions ?? []),
    ]
    setNodePositions(() => {
      const next = new Map<string, NodePosition>()
      allGeneratedNodes.forEach((node, idx) => {
        next.set(node.id, {
          x: 40 + (idx % 4) * 210,
          y: 60 + Math.floor(idx / 4) * 140,
        })
      })
      return next
    })
    setSelectedNodeId(null)
    writeOutput('AI generate', normalized)
  }, [])

  async function handleGenerateAI() {
    try {
      if (!aiPrompt.trim()) { writeOutput('AI', 'Prompt required'); return }
      const res = await postJSON<{ ir: unknown }>('/api/ai/generate', {
        prompt: aiPrompt.trim(),
        context: { targetName: simulationTarget },
      })
      handleGenerated(res.ir as WorkflowIR)
    } catch (err) {
      writeOutput('AI generate failed', (err as Error).message)
    }
  }

  const { label: modeLabel, dotColor: modeDotColor } = getModeInfo()

  return (
    <main className="h-screen flex overflow-hidden bg-bg text-text-primary font-ui">
      <Sidebar
        aiPrompt={aiPrompt}
        onAddNode={handleAddNode}
        onAiPromptChange={setAiPrompt}
        onGenerated={handleGenerated}
        simulationTarget={simulationTarget}
        onRepair={handleRepair}
      />

      <section className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Topbar
          selectionText={getSelectionText()}
        />
        <CanvasToolbar
          simulationTarget={simulationTarget}
          modeLabel={modeLabel}
          modeDotColor={modeDotColor}
          onSimulationTargetChange={handleSimulationTargetChange}
          onSimulate={handleSimulate}
        />

        <div className="flex-1 flex flex-col overflow-hidden">
          <WorkflowCanvas
            ir={ir}
            nodePositions={nodePositions}
            selectedNodeId={selectedNodeId}
            onNodePositionsChange={setNodePositions}
            onSelectNode={setSelectedNodeId}
            onDropNode={handleDropNode}
            onFieldChange={handleFieldChange}
            onAddEdge={handleAddEdge}
            onDeleteNode={handleDeleteNode}
          />

          <NodeInputPanel
            selectedNode={selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) ?? null : null}
            onFieldChange={(key, value) => { if (selectedNodeId) handleFieldChange(selectedNodeId, key, value) }}
          />

          <BottomPanels
            irJson={JSON.stringify(ir, null, 2)}
            output={output}
            isSimulating={isSimulating}
            simulationTarget={simulationTarget}
            onIRJsonChange={handleIRJsonChange}
            onClearOutput={() => setOutput('')}
          />
        </div>
      </section>
    </main>
  )
}
