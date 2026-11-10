import EventEmitter from 'eventemitter3'
import tippy from "tippy.js"

class Controller {
    constructor({ cy }) {
        this.cy = cy
        this.bus = new EventEmitter()
        // Cache: areaId -> child areaIds from the backend, used for efficient collapse.
        this.areaChildrenCache = new Map()
        // Cache of raw area objects fetched from the backend.
        this.areaDataCache = new Map()
        // areaId -> child areaIds derived from in_area links; built lazily
        // when the backend lacks child_areas.
        this.areaHierarchy = null
        this.options = {
            autolayout: true,
            autoselect: true
        }
    }

    /**
     * Return child areas of areaId, merging backend child_areas with the
     * in_area hierarchy.
     * @param {string} areaId
     * @returns {Promise<string[]>}
     */
    async getChildAreas(areaId) {
        const hierarchy = await this.getAreaHierarchy()
        const fromHierarchy = hierarchy.get(areaId) || []
        const fromData = this.areaChildrenCache.get(areaId) || []
        // Deduplicate while keeping the backend-provided order first.
        return [...new Set([...fromData, ...fromHierarchy])]
    }

    /**
     * Build (once) areaId -> child areaIds from in_area links, so data
     * without child_areas still works.
     * @returns {Promise<Map<string, string[]>>}
     */
    async getAreaHierarchy() {
        if (this.areaHierarchy) {
            return this.areaHierarchy
        }
        const hierarchy = new Map()
        let names = []
        try {
            names = await this.getAllAreas()
        } catch {
            names = []
        }
        await Promise.all((names || []).map(async (name) => {
            let areaData = this.areaDataCache.get(name)
            if (!areaData) {
                try {
                    areaData = await this.getDataFromBackend(name, false)
                    this.areaDataCache.set(name, areaData)
                } catch {
                    // Do not cache failures; a transient error must not block
                    // later resolution.
                    return
                }
            }
            this.areaChildrenCache.set(name, areaData.child_areas || [])
            if (areaData.in_area) {
                if (!hierarchy.has(areaData.in_area)) {
                    hierarchy.set(areaData.in_area, [])
                }
                hierarchy.get(areaData.in_area).push(name)
            }
        }))
        this.areaHierarchy = hierarchy
        return hierarchy
    }

    undo() {
        this.cy.undoRedo().undo()
    }

    redo() {
        this.cy.undoRedo().redo()
    }

    downloadSVG() {
        let url = window.URL.createObjectURL(new Blob([this.cy.svg({ 'full': 'true' })], { type: 'image/svg+xml' }))
        this.download(url)
    }

    downloadPNG() {
        let url = window.URL.createObjectURL(this.cy.png({ 'output': 'blob', 'full': 'true' }))
        this.download(url)
    }

    downloadJson() {
        const { cy } = this
        let out = []
        cy.nodes().jsons().forEach(element => {
            let o = { data: {} }
            o.data.id = element.data.id
            o.data.v6 = element.data.v6
            o.position = element.position
            out.push(o)
        })
        let url = window.URL.createObjectURL(new Blob([JSON.stringify(out)], { type: 'application/json' }))
        this.download(url)
    }

    download(url) {
        let date = new Date()
        let name = "netvis-" + date.getFullYear().toString() + "-" + (date.getMonth() + 1).toString() + "-" + date.getDate().toString() + "-"
            + date.getHours().toString() + "-" + date.getMinutes().toString() + "-" + date.getSeconds().toString()
        let a = document.createElement("a")
        a.href = url
        a.download = name
        a.click()
        a.remove()
        window.URL.revokeObjectURL(url)
    }

    runLayout() {
        // this.cy.elements().layout({ name: "cose-bilkent" }).run()
        this.cy.undoRedo().do("layout", {
            options: { name: "cose-bilkent" }
        })
    }

    selectedLayout() {
        // this.cy.elements(':selected').layout({ name: "cose-bilkent", fit: false }).run()
        this.cy.undoRedo().do("layout", {
            eles: cy.nodes(':selected'),
            options: { name: "cose-bilkent", fit: false }
        })
    }

    selectedNeighbors() {
        this.cy.elements(':selected').forEach(s => this.showAllNeighbors(s.data("neighbors"), s.data("v6")))
    }

    async showAllNeighbors(neighbors, v6) {
        if ( !neighbors ) return
        let neigh = []
        let areas = []
        neighbors.forEach(n => {
            if ( typeof n === "string" ) {
                // Area neighbors are plain ids; load areas collapsed, other
                // objects as regular nodes.
                if ( n.startsWith("area:") ) {
                    areas.push(n)
                } else {
                    neigh.push({ id: n })
                }
            } else if ( n && n.id && n.id.startsWith("area:") ) {
                areas.push(n.id)
            } else if ( n && n.id ) {
                neigh.push(n)
            }
        })
        const nodeCount = this.cy.elements().length
        if ( neigh.length > 0 ) await this.showNode(neigh, v6)
        for ( const a of areas ) await this.loadArea(a)
        // showNode runs a layout internally, but areas loaded afterwards pile
        // up at the origin. Run a layout once all neighbors are on the canvas.
        if ( areas.length > 0 && this.cy.elements().length !== nodeCount && this.options.autolayout )
            this.runLayout()
    }

    centerGraph() {
        this.cy.fit()
    }

    connectMissingNeighbors(node) {
        const { cy } = this
        if ( !node.data().neighbors )
            return
        node.data().neighbors.forEach((n) => {
            // Area neighbors are plain strings ("area:name"), all other
            // neighbors are objects ({ id, ... }).
            const neighborId = typeof n === "string" ? n : n && n.id
            if ( !neighborId ) return
            if ( cy.getElementById(neighborId).length === 1 && node.neighborhood().getElementById(neighborId).length !== 1 ) {
                let edgeCount = 1
                if ( n.is_tunnel ) edgeCount = 2
                for (let i = 0; i < edgeCount; i++) {
                    cy.add({
                        data: {
                            source: node.id(),
                            target: neighborId,
                            is_tunnel: n.is_tunnel,
                        }
                    })
                }
            }
        })
    }

    showPath(path) {
        let pathNodes = this.getPathFromBackend(path)
        let nodes = []
        Promise.resolve(pathNodes).then((res) => {
            res.forEach(node => nodes.push({ id: node }))
            this.showNode(nodes.filter(n => !n.id.startsWith("network:tunnel") && !n.id.startsWith("interface:")), false)
                .then(() => {
                        this.runLayout()
                        this.cy.elements().unselect()
                    }
                )
        })
        this.options.autolayout = false
    }

    showSingleNode(name, v6) {
        let nodeCount = this.cy.elements().length
        Promise.resolve(this.addNode(name, v6)).then(areaRemoved => {
            if ( (nodeCount !== this.cy.elements().length || areaRemoved) && this.options.autolayout )
                this.runLayout()
        })
    }

    showNode(name, v6) {
        const { cy } = this
        let nodeCount = cy.elements().length
        let promises = []
        let nodesData = []
        name.forEach((n) => {
            if ( n.id.startsWith("interface") || n.id.startsWith("network:tunnel") ) return
            promises.push(this.getDataFromBackend(n.id, v6).then(
                node => {
                    nodesData.push({ data: node })
                }
            ))
        })

        return Promise.all(promises).then(() => {
            let areaRemoved = false
            nodesData.forEach(({ data }) => {
                areaRemoved = this.removeCollapsedAreaForNode(data) || areaRemoved
            })
            let addedNodes = cy.undoRedo().do("add", nodesData)
            addedNodes.forEach(node => {
                this.connectMissingNeighbors(node)
                // Ensure node is properly selectable
                node.selectable(true)
                node.grabbable(true)
            })
            if ( (nodeCount !== this.cy.elements().length || areaRemoved) && this.options.autolayout )
                this.runLayout()
            return true
        })

    }

    removeCollapsedAreaForNode(nodeData) {
        const areaId = nodeData.in_area
        if ( !areaId ) return false

        const areaNode = this.cy.getElementById(areaId)
        if ( areaNode.length === 0 || areaNode.data("type") !== "area" ) return false

        this.cy.undoRedo().do("remove", areaNode)
        return true
    }

    async addNode(name, v6) {
        if ( name.startsWith("interface") || name.startsWith("network:tunnel") ) return
        const { cy } = this
        let elements = cy.getElementById(name)
        if ( elements.length === 1 ) {
            const areaRemoved = this.removeCollapsedAreaForNode(elements[0].data())
            if ( this.options.autoselect ) this.nodeSelect(elements[0])
            return areaRemoved
        }
        
        // Handle area nodes specially
        if (name.startsWith("area:")) {
            return this.loadArea(name)
        }
        
        return this.getDataFromBackend(name, v6).then(
            node => {
                const areaRemoved = this.removeCollapsedAreaForNode(node)
                let addedNode = cy.undoRedo().do("add", { data: node })
                this.connectMissingNeighbors(addedNode.element())
                if ( this.options.autoselect ) this.nodeSelect(addedNode.element())
                return areaRemoved
            }
        ).catch(
            err => {
                this.bus.emit('showErr', err)
            }
        )
    }

    async getDataFromBackend(name, v6) {
        return await fetch("/netvis/backend/get?id=" + name + "&v6=" + v6).then(
            async (res) => {
                if ( !res.ok ) {
                    let text = await res.text()
                    throw text;
                }
                return res.json()
            }
        )
    }

    async getPathFromBackend(path) {
        return await fetch("/netvis/backend/path?source=" + path.source + "&destination=" + path.destination).then(
            async (res) => {
                if ( !res.ok ) {
                    let text = await res.text()
                    await console.log(res)
                    throw text;
                }
                return res.json()
            }
        ).catch(
            err => {
                this.bus.emit('showErr', err)
            }
        )
    }

    updateNodeDataFromBackend() {
        const { cy } = this
        let promises = []
        cy.nodes().forEach(n => {
            promises.push(
                this.getDataFromBackend(n.id(), n.data("v6")).then(
                    result => n.data(result)
                ).catch(
                    err => {
                        this.bus.emit('showErr', err)
                        cy.remove('[id="' + n.id() + '"]')
                    }
                )
            )
        })
        Promise.all(promises).then(() => {
            cy.nodes().forEach(n => {
                this.connectMissingNeighbors(n)
            })
        })
    }

    addNodesFromArray(nodes) {
        const { cy } = this
        cy.add(nodes)
        cy.fit()
        this.updateNodeDataFromBackend()
    }

    nodeSelect(node) {
        const { cy } = this
        cy.elements().unselect()
        node.select()
        this.bus.emit('showInfo', node)
    }

    nodeUnselect(node) {
        this.bus.emit('hideInfo')
    }

    nodeCxtTap(node) {
        const { cy } = this
        const selected = cy.elements(':selected')
        // A right click removes the clicked object. Remove other selected
        // nodes only if the click is part of an explicit multi-selection.
        if ( node.selected() && selected.length > 1 ) {
            cy.undoRedo().do("remove", selected)
        } else {
            cy.elements().unselect()
            node.select()
            cy.undoRedo().do("remove", node)
        }
    }

    /**
     * Get all available areas from backend
     */
    async getAllAreas() {
        return await fetch("/netvis/backend/areas").then(async (res) => {
            if (!res.ok) {
                let text = await res.text()
                throw text
            }
            return res.json()
        }).catch(err => {
            this.bus.emit('showErr', err)
            return []
        })
    }

    /**
     * Load and display an area node by its ID
     * @param {string} areaId - The area ID (e.g., "area:g17")
     * @param {string} parentAreaId - Optional parent area ID if this is a child area
     */
    async loadArea(areaId, parentAreaId = null) {
        const { cy } = this
        
        // Check if area already exists
        if (cy.getElementById(areaId).length > 0) {
            this.nodeSelect(cy.getElementById(areaId))
            return cy.getElementById(areaId)
        }

        // Fetch area data from backend (or use the cached copy)
        try {
            let areaData = this.areaDataCache.get(areaId)
            if (!areaData) {
                areaData = await this.getDataFromBackend(areaId, false)
                this.areaDataCache.set(areaId, areaData)
            }
            
            // Prepare node data
            const nodeData = { 
                ...areaData, 
                id: areaId,
                type: "area",
                label: areaId
            }

            // Routers at border interfaces lie outside the area and connect
            // it to neighbors; routers at inclusive_border interfaces are
            // area members and must not be shown as external neighbors.
            const boundaryRouters = []
            const seenRouters = new Set()
            ;(areaData.border || []).forEach(intf => {
                const m = /^interface:([^.]+)\./.exec(intf)
                if ( !m ) return
                const routerId = "router:" + m[1]
                if ( seenRouters.has(routerId) ) return
                seenRouters.add(routerId)
                boundaryRouters.push({ id: routerId, neighbor_count: 1 })
            })
            if ( boundaryRouters.length > 0 ) {
                // Skip boundary routers that are already reported by the backend.
                const reported = new Set((nodeData.neighbors || []).map(n => typeof n === "string" ? n : n.id))
                const extra = boundaryRouters.filter(br => !reported.has(br.id))
                if ( extra.length > 0 ) {
                    nodeData.neighbors = [...(nodeData.neighbors || []), ...extra]
                }
            }
            
            // If this is a child area, add parent area reference
            if (parentAreaId) {
                nodeData.in_area = parentAreaId
            }

            // Cache child areas for collapse. If the backend lacks
            // child_areas, derive them from the in_area hierarchy.
            let childAreas = nodeData.child_areas || []
            if (childAreas.length === 0) {
                const hierarchy = await this.getAreaHierarchy()
                childAreas = hierarchy.get(areaId) || []
                if (childAreas.length > 0) {
                    nodeData.child_areas = childAreas
                }
            }
            this.areaChildrenCache.set(areaId, childAreas)
            
            // Add area node to graph
            const areaNode = cy.undoRedo().do("add", { 
                data: nodeData
            })
            
            // Draw edges to any neighbor areas already on the canvas.
            this.connectMissingNeighbors(areaNode.element())
            
            cy.fit()
            if (this.options.autoselect) {
                this.nodeSelect(areaNode.element())
            }
            
            return areaNode.element()
        } catch (err) {
            this.bus.emit('showErr', err)
        }
    }

    /**
     * Expand an area node to show all its member objects
     * @param {Object} areaNode - The Cytoscape area node to expand
     */
    async expandArea(areaNode) {
        const { cy } = this
        
        if (!areaNode || areaNode.data("type") !== "area") {
            return
        }

        const areaId = areaNode.id()
        const areaData = areaNode.data()
        const routers = areaData.routers || []
        const networks = areaData.networks || []
        // Prefer backend child_areas. Child areas are added collapsed, so
        // expanding an area reveals only one level.
        const childAreas = await this.getChildAreas(areaId)
        
        // Remove the area node
        cy.undoRedo().do("remove", areaNode)
        
        // Add direct member nodes (routers and networks)
        const memberIds = [...routers, ...networks]
        if (memberIds.length > 0) {
            const members = memberIds.map(id => ({ id }))
            await this.showNode(members, false)
        }
        
        // Add child areas as collapsed area nodes with parent reference
        for (const childAreaId of childAreas) {
            await this.loadArea(childAreaId, areaId)
        }
        
        // Layout after all members and child areas are on the canvas,
        // otherwise child areas loaded after showNode pile up at the origin.
        if (this.options.autolayout && childAreas.length > 0 && cy.elements().length > 0) {
            this.runLayout()
        }
    }

    /**
     * Collapse all visible objects that belong to an area back into the area node
     * @param {Object} node - A node that belongs to an area
     */
    async collapseToArea(node) {
        const { cy } = this
        
        const areaId = node.data("in_area")
        if (!areaId) {
            return
        }

        // Collect all descendants of areaId from two sources: runtime
        // in_area links and the cached backend hierarchy.
        const memberIds = new Set()
        const queue = [areaId]

        // Walk the area tree using cached backend hierarchy.
        while (queue.length > 0) {
            const currentArea = queue.shift()
            const children = await this.getChildAreas(currentArea)
            for (const child of children) {
                if (!memberIds.has(child)) {
                    memberIds.add(child)
                    queue.push(child)
                }
            }
        }

        // Collect direct members, descendants and collapsed child-area nodes,
        // keyed by id so each node is collected once.
        const areaMembers = new Map()
        cy.nodes().forEach(n => {
            const nArea = n.data("in_area")
            // routers/networks inside the parent area
            if (nArea === areaId) areaMembers.set(n.id(), n)
            // routers/networks inside any descendant area
            if (nArea && memberIds.has(nArea)) areaMembers.set(n.id(), n)
            // collapsed child area nodes themselves
            if (n.data("type") === "area" && memberIds.has(n.id())) areaMembers.set(n.id(), n)
        })
        const areaMembersArray = [...areaMembers.values()]

        if (areaMembersArray.length === 0) {
            return
        }

        // Calculate center position for area node using Cytoscape collection
        const areaMembersCollection = cy.collection(areaMembersArray)
        const boundingBox = areaMembersCollection.boundingBox()
        const centerPos = {
            x: (boundingBox.x1 + boundingBox.x2) / 2,
            y: (boundingBox.y1 + boundingBox.y2) / 2
        }

        // Find boundary edges (edges connecting area members to external nodes)
        const boundaryEdges = []
        areaMembersArray.forEach(member => {
            member.connectedEdges().forEach(edge => {
                const source = edge.source()
                const target = edge.target()
                
                // A boundary edge has exactly one endpoint in areaMembersArray.
                const sourceInArea = areaMembersArray.includes(source)
                const targetInArea = areaMembersArray.includes(target)
                
                if (sourceInArea !== targetInArea) {
                    // This is a boundary edge
                    const externalNode = sourceInArea ? target.id() : source.id()
                    const isTunnel = edge.data("is_tunnel")
                    
                    // Avoid duplicates
                    if (!boundaryEdges.find(e => e.external === externalNode && e.tunnel === isTunnel)) {
                        boundaryEdges.push({
                            external: externalNode,
                            tunnel: isTunnel
                        })
                    }
                }
            })
        })

        // Remove all area members (and their edges)
        cy.undoRedo().do("remove", areaMembersCollection)

        // Load the collapsed area node.
        const areaNode = await this.loadArea(areaId)
        
        // Position it at the calculated center
        if (areaNode) {
            areaNode.position(centerPos)
            
            // Recreate boundary edges to the area node
            boundaryEdges.forEach(({ external, tunnel }) => {
                // Skip neighbors that are no longer on the canvas to avoid
                // cytoscape silently creating empty ghost nodes for them.
                if (cy.getElementById(external).length === 0) {
                    return
                }
                // Connect the area node to the external node.
                cy.undoRedo().do("add", {
                    data: {
                        source: areaId,
                        target: external,
                        is_tunnel: tunnel
                    }
                })
                
                // Add second edge if it's a tunnel
                if (tunnel) {
                    cy.undoRedo().do("add", {
                        data: {
                            source: areaId,
                            target: external,
                            is_tunnel: tunnel
                        }
                    })
                }
            })
        }
    }

    elementMouseover(element) {
        let ref = element.popperRef()
        let dummyDomEle = document.createElement('div')

        let data = ""
        if ( element.isNode() ) {
            if ( element.data("in_area") ) data = "In Area " + element.data("in_area")
            if ( element.data("address") ) data += (data ? "<br />" : "") + "IP: " + element.data("address")
            if ( element.data("address2") ) data += (data ? "<br />" : "") + "IPv6: " + element.data("address2")

            if ( element.data("type") === "network" && element.data("hosts") )
                data += (data ? "<br />" : "") + element.data("hosts").length + " Host" +
                    (element.data("hosts").length > 1 ? "s" : "")

            if ( element.data("type") === "area" && element.data("neighbors") ) {
                let areaNeighbors = element.data("neighbors").filter(n =>
                    (typeof n === "string" && n.startsWith("area:")) ||
                    (n && n.id && n.id.startsWith("area:")))
                if ( areaNeighbors.length > 0 )
                    data += (data ? "<br />" : "") + areaNeighbors.length + " neighbor area" + (areaNeighbors.length > 1 ? "s" : "")
            }

            if ( element.data("type").startsWith("router") && element.data("neighbors") ) {
                if ( element.data("type").includes(":") )
                    data += (data ? "<br />" : "") + element.data("type")
                let interfaces = element.data("neighbors").filter(n => typeof n === "object" && n.id && n.id.startsWith("interface:"))
                if ( interfaces.length > 0 )
                    data += (data ? "<br />" : "") + interfaces.length + " Interface" + (interfaces.length > 1 ? "s" : "")
            }
            if ( element.data("v6") === "true" ) data += (data ? "<br />" : "") + "v6"
        } else {
            data = element.data("is_tunnel") ? "Tunnel" : ""
        }

        if ( data ) {
            let tip = new tippy(dummyDomEle, {
                getReferenceClientRect: ref.getBoundingClientRect,
                trigger: 'manual',
                content: () => {
                    let content = document.createElement('div')
                    content.innerHTML = data
                    content.style.display = "flex"
                    content.style.textAlign = "center"
                    return content
                }
            });
            tip.show()
            element.data("popup", tip)
        }
    }

    elementMouseout(element) {
        if ( undefined !== element.data("popup") ) {
            element.data("popup").destroy()
            element.removeData("popup")
        }
    }
}

export { Controller }
export default Controller