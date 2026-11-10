<script setup>
import { onBeforeUpdate, reactive } from "vue";

const props = defineProps(['cy', 'node', 'controller'])
let neighbors, hosts
const sortNeighbors = (a, b) => (b.neighbor_count || 0) - (a.neighbor_count || 0)
const getNeighbors = (data) => {
  // Neighbors are objects ({ id, neighbor_count, ... }) or, for areas,
  // plain id strings. Keep both so area-to-area neighbors and border
  // objects stay visible.
  const isNeighborId = (s) => /^(area|router|network):/.test(s) && !s.startsWith("network:tunnel")
  return (data || []).filter(n =>
    (typeof n === "string" && isNeighborId(n)) ||
    (typeof n === "object" && n !== null && n.id !== undefined)
  )
}
if ( props.node.data().neighbors )
  neighbors = reactive(getNeighbors(props.node.data().neighbors).sort(sortNeighbors))
else
  neighbors = reactive([])
if ( props.node.data().hosts )
  hosts = reactive(props.node.data().hosts)

onBeforeUpdate(() => {
  if ( props.node.data().neighbors )
    neighbors = reactive(getNeighbors(props.node.data().neighbors).sort(sortNeighbors))
  else
    neighbors = reactive([])
  if ( props.node.data().hosts )
    hosts = reactive(props.node.data().hosts)
})

const showAllNeighbors = (neighbors) => {
  props.controller.showAllNeighbors(neighbors, props.node.data().v6)
}

const collapseToArea = () => {
  props.controller.collapseToArea(props.node)
}

</script>

<template>
  <div class="app-node-info">
    <div class="node-info-name">Nachbarn</div>
    <div class="node-info-body">
      <ul class="node-info-list">
        <li class="clickable" @click="async () => showAllNeighbors(neighbors)">zeige alle</li>
        <template v-for="n in neighbors">
          <li v-if='typeof n === "object" && n.id && !n.id.startsWith("interface") && !n.id.startsWith("network:tunnel")'
              class="clickable"
              :class="{ 'area-neighbor': n.id.startsWith('area:') }"
              @click="async () => controller.showSingleNode(n.id, node.data().v6)">
            {{ n.id + (cy.getElementById(n.id).length === 1 ? "⋆" : "") }}
          </li>
          <li v-else-if='typeof n === "string" && (n.startsWith("area:") || n.startsWith("router:") || n.startsWith("network:"))'
              class="clickable"
              :class="{ 'area-neighbor': n.startsWith('area:') }"
              @click="async () => controller.showSingleNode(n, node.data().v6)">
            {{ n }}
          </li>
        </template>
      </ul>
    </div>
    <button
      v-if="node.data('in_area')"
      class="collapse-btn"
      @click="collapseToArea"
      :title="'Alle Knoten von ' + node.data('in_area') + ' einklappen'"
    >
      ▼ Einklappen zu {{ node.data('in_area') }}
    </button>
  </div>
  <div class="app-node-info right">
    <div class="node-info-name">{{ node.id() }}</div>
    <div class="node-info-body"
         v-if='node.data("hosts") || getNeighbors(node.data("neighbors")).filter(n => typeof n === "object" && n.id && n.id.startsWith("interface:")).length > 0'>
      <ul class="node-info-list">
        <template v-for="n in neighbors">
          <li
              v-if='typeof n === "object" && n.id && n.id.startsWith("interface")'
          >{{ n.id }}
          </li>
        </template>
        <template v-if='node.data("hosts")' v-for="h in hosts">
          <li>
            {{ h }}
          </li>
        </template>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.app-node-info {
  position: absolute;
  top: 50px;
  left: 0;
  background: var(--buttonColor);
  box-shadow: 0 0 1em black;
  z-index: 10;
  padding: 0.5em;
  border-radius: 0.5em;
  margin: 1em;
  font-size: 0.8em;
  color: #fff;
  cursor: default;
}

.app-node-info.right {
  right: 0;
  left: unset;
}

.node-info-name {
  display: flex;
  justify-content: center;
  font-size: 1.25em;
  margin: 0.125em 0.2em;
}

.node-info-body {
  margin-top: 0.5em;

  .node-info-list {
    overflow: auto;
    max-height: 70vh;

    li {
      margin: 0.2em;
      margin-block-end: 0.1em;
      padding: 0.2em;
    }

    .clickable:hover {
      color: var(--buttonActiveColor);
      cursor: pointer;
      -ms-user-select: none;
      -webkit-user-select: none;
      user-select: none;
    }

    .area-neighbor {
      font-style: italic;
      color: #b8f0b8;
    }
  }
}

.collapse-btn {
  display: block;
  margin-top: 0.5em;
  width: 100%;
  background-color: #2a6e2a;
  color: #fff;
  border: 1px dashed #00cc00;
  border-radius: 4px;
  padding: 0.3em 0.5em;
  cursor: pointer;
  font-size: 0.95em;

  &:hover {
    background-color: #1e4f1e;
  }
}
</style>