import type { Node, Edge } from '@xyflow/react'
import type { UseQueryResult } from '@tanstack/react-query'
import type { Claw, ClawAgentsResponse } from '@/ts/Interfaces'

import { useMemo } from 'react'
import dagre from 'dagre'
import { clawStatus } from '@openclaw/shared'

const CLAW_NODE_WIDTH = 280
const CLAW_NODE_HEIGHT = 140
const AGENT_NODE_WIDTH = 240
const AGENT_NODE_HEIGHT = 100

const usePlaygroundGraph = (
    claws: Claw[],
    agentQueries: UseQueryResult<ClawAgentsResponse>[]
) => {
    return useMemo(() => {
        const nodes: Node[] = []
        const edges: Edge[] = []

        const g = new dagre.graphlib.Graph()
        g.setDefaultEdgeLabel(() => ({}))
        g.setGraph({
            rankdir: 'TB',
            nodesep: 80,
            ranksep: 20,
            marginx: 40,
            marginy: 40
        })

        claws.forEach((claw, index) => {
            const query = agentQueries[index]
            const canShowAgents =
                claw.status === clawStatus.running ||
                claw.status === clawStatus.unreachable
            const agentsData = canShowAgents ? query?.data : undefined
            const agents = agentsData?.agents || []
            const isLoading = canShowAgents && (query?.isLoading ?? false)

            const clawNodeId = `claw-${claw.id}`

            g.setNode(clawNodeId, {
                width: CLAW_NODE_WIDTH,
                height: CLAW_NODE_HEIGHT
            })

            nodes.push({
                id: clawNodeId,
                type: 'clawNode',
                position: { x: 0, y: 0 },
                data: {
                    claw,
                    agentCount: agents.length,
                    isLoadingAgents: isLoading,
                    isSelected: false
                } as Record<string, unknown>,
                draggable: false
            })

            agents.forEach((agent) => {
                const agentNodeId = `agent-${claw.id}-${agent.id}`

                g.setNode(agentNodeId, {
                    width: AGENT_NODE_WIDTH,
                    height: AGENT_NODE_HEIGHT
                })

                nodes.push({
                    id: agentNodeId,
                    type: 'agentNode',
                    position: { x: 0, y: 0 },
                    data: {
                        agent,
                        clawName: claw.name,
                        clawId: claw.id,
                        isSelected: false,
                        subdomain: claw.subdomain,
                        gatewayToken: claw.gatewayToken
                    } as Record<string, unknown>,
                    draggable: false
                })

                g.setEdge(clawNodeId, agentNodeId)

                edges.push({
                    id: `edge-${clawNodeId}-${agentNodeId}`,
                    source: clawNodeId,
                    target: agentNodeId,
                    type: 'straight',
                    style: {
                        stroke: 'hsl(var(--muted-foreground) / 0.3)',
                        strokeWidth: 1.5
                    }
                })
            })
        })

        dagre.layout(g)

        nodes.forEach((node) => {
            const dagreNode = g.node(node.id)
            if (dagreNode) {
                node.position = {
                    x: dagreNode.x - dagreNode.width / 2,
                    y: dagreNode.y - dagreNode.height / 2
                }
            }
        })

        return { nodes, edges }
    }, [claws, agentQueries])
}

export default usePlaygroundGraph