<script setup>

import { onBeforeUnmount, onMounted, ref } from "vue";

const props = defineProps(['cy', 'controller', 'node', 'path'])
const cy = props.cy
const controller = props.controller
const path = props.path
const bus = controller.bus
const err = ref([])

let onSelect, onUnselect, onCxttap, onMouseover, onMouseout, onDbltap, showErr

onMounted(() => {
  cy.mount(document.getElementById("cy"))

  bus.on('showErr', showErr = (e, stay) => {
    err.value.push(e.toString())
    console.log(e)
    let interval = setInterval(() => {
      err.value = null
      clearInterval(interval)
      if ( cy.elements().length === 0 ) location.reload()
    }, 10000)
  })

  //show inital submitted node(s) or path
  if ( path !== undefined && path.source !== "Quelle" && path.destination !== "Ziel" ) {
    controller.showPath(path)
  } else if ( props.node instanceof Array ) {
    controller.addNodesFromArray(props.node)
    controller.options.autolayout = false
  } else {
    controller.showSingleNode(props.node.name, props.node.v6)
  }

  cy.on('tapselect', 'node', onSelect = e => {
    controller.nodeSelect(e.target)
  })

  cy.on('unselect', 'node', onUnselect = e => {
    controller.nodeUnselect(e.target)
  })

  cy.on('cxttap', 'node', onCxttap = e => {
    controller.nodeCxtTap(e.target)
  })

  cy.on('dbltap', 'node', onDbltap = e => {
    const node = e.target
    if (node.data("type") === "area") {
      controller.expandArea(node)
    }
  })

  cy.on("mouseover", "node, edge", onMouseover = e => {
    controller.elementMouseover(e.target)
  })

  cy.on("mouseout", "node, edge", onMouseout = e => {
    controller.elementMouseout(e.target)
  })
})

onBeforeUnmount(() => {
  cy.removeListener('select', onSelect)
  cy.removeListener('unselect', onUnselect)
  cy.removeListener('cxttap', onCxttap)
  cy.removeListener('dbltap', onDbltap)
  cy.removeListener('mouseover', onMouseover)
  cy.removeListener('mouseout', onMouseout)
  bus.removeListener('showErr', showErr)
})

</script>

<template>
  <h1 :class="{error: true, top: i === 0}" v-for="(e, i) in err">{{ e }}</h1>
  <div id="cy"/>
</template>

<style scoped>
#cy {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  top: 45px;
  z-index: 1;
}

.top {
  margin-top: 4%;
}

.error {
  display: flex;
  position: relative;
  z-index: 2;
  background: var(--bodyBgColor);
  justify-content: center;
}
</style>