import { Emitter } from '../lib/dom.js'
import type { Meta, NodeView, RangeKey } from '../lib/types.js'

export const state = {
  nodes: new Map<string, NodeView>(),
  meta: null as Meta | null,
  selected: null as string | null,
  range: '1h' as RangeKey,
}

export const bus = {
  select: new Emitter<string>(),
  range: new Emitter<RangeKey>(),
  live: new Emitter<NodeView>(),
  nodes: new Emitter<void>(),
}

export const selectedNode = (): NodeView | undefined => (state.selected ? state.nodes.get(state.selected) : undefined)
export const meta = (): Meta => { if (!state.meta) throw new Error('meta no cargada'); return state.meta }