<script setup>
import { ref, computed, nextTick, onBeforeUnmount, onMounted } from "vue";

const props = defineProps({
  node: {
    name: String,
    v6: Boolean,
    required: true
  },
  path: {
    source: String,
    destination: String
  }
})

const emit = defineEmits(['submitted'])
const initName = props.node.name
const node = ref(props.node)
const path = ref(props.path)
const style = "width: " + (initName ? "49%" : "100%")
const title = import.meta.env.VITE_APP_TITLE
const objectNames = ref([])
const showSuggestions = ref(false)
const highlightedIndex = ref(-1)
const suggestionList = ref(null)
const fieldRow = ref(null)
// Text typed into the object field. Starts empty even with a default
// object, so the default acts as a placeholder.
const query = ref("")

const suggestions = computed(() => {
  const term = query.value.trim().toLowerCase()
  if ( !term ) return []
  const matching = objectNames.value.filter(name =>
    !name.startsWith("network:tunnel") && name.toLowerCase().includes(term)
  )
  matching.sort((a, b) => {
    const al = a.toLowerCase()
    const bl = b.toLowerCase()
    const aPrefix = al.startsWith(term)
    const bPrefix = bl.startsWith(term)
    if ( aPrefix !== bPrefix ) return aPrefix ? -1 : 1
    return al.localeCompare(bl)
  })
  return matching.slice(0, 100)
})

const suggestionsOpen = computed(() =>
  showSuggestions.value && suggestions.value.length > 0
)

onMounted(async () => {
  // Fetch routers, networks and areas for autocomplete.
  try {
    const response = await fetch("/netvis/backend/names")
    if (response.ok) {
      objectNames.value = await response.json()
    }
  } catch (err) {
    console.error("Failed to fetch object names:", err)
  }
})

onMounted(() => {
  // Close the list on outside click; hiding on blur would break dragging
  // the suggestion scrollbar.
  document.addEventListener("pointerdown", onDocumentPointerDown)
})

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onDocumentPointerDown)
})

function typeOf(name) {
  if ( name.startsWith("area:") ) return "Bereich"
  if ( name.startsWith("router:") ) return "Router"
  if ( name.startsWith("network:") ) return "Netzwerk"
  return ""
}

function onNameInput(event) {
  query.value = event.target.value
  node.value.name = query.value
  showSuggestions.value = true
  highlightedIndex.value = -1
  nextTick(() => {
    if ( suggestionList.value ) suggestionList.value.scrollTop = 0
  })
}

function onNameFocus() {
  if ( suggestions.value.length > 0 ) {
    showSuggestions.value = true
  }
}

function hideSuggestions() {
  showSuggestions.value = false
  highlightedIndex.value = -1
}

function onDocumentPointerDown(event) {
  if ( fieldRow.value && !fieldRow.value.contains(event.target) ) {
    hideSuggestions()
  }
}

function onSuggestionPointerDown(event, name) {
  // Select immediately for mouse/pen and keep focus; touches use click so
  // swiping can still scroll.
  if ( event.pointerType === "mouse" || event.pointerType === "pen" ) {
    event.preventDefault()
    selectSuggestion(name)
  }
}

function scrollHighlightedIntoView() {
  nextTick(() => {
    const list = suggestionList.value
    if ( !list ) return
    const item = list.children[highlightedIndex.value]
    if ( !item ) return
    const top = item.offsetTop
    const bottom = top + item.offsetHeight
    if ( top < list.scrollTop ) {
      list.scrollTop = top
    } else if ( bottom > list.scrollTop + list.clientHeight ) {
      list.scrollTop = bottom - list.clientHeight
    }
  })
}

function selectSuggestion(name) {
  query.value = name
  node.value.name = name
  showSuggestions.value = false
  highlightedIndex.value = -1
}

function onNameKeydown(event) {
  if ( !showSuggestions.value || suggestions.value.length === 0 ) return
  if ( event.key === "ArrowDown" ) {
    event.preventDefault()
    highlightedIndex.value = (highlightedIndex.value + 1) % suggestions.value.length
    scrollHighlightedIntoView()
  } else if ( event.key === "ArrowUp" ) {
    event.preventDefault()
    highlightedIndex.value = highlightedIndex.value <= 0
      ? suggestions.value.length - 1
      : highlightedIndex.value - 1
    scrollHighlightedIntoView()
  } else if ( event.key === "Escape" || event.key === "Tab" ) {
    hideSuggestions()
  } else if ( event.key === "Enter" && highlightedIndex.value >= 0 ) {
    event.preventDefault()
    selectSuggestion(suggestions.value[highlightedIndex.value])
  }
}


function submitHandler() {
  node.value.name = query.value || initName
  hideSuggestions()
  console.log("Submit ", node.value, path.value)
  emit('submitted', node.value, path.value)
}

function onFileChanged(event) {
  let reader = new FileReader()
  reader.onload = (e) => {
    try {
      let data = JSON.parse(e.target.result)
      emit('submitted', data)
    } catch (e) {
      console.error("Die Datei \"" + event.target.files[0].name + "\" enthält kein gültiges JSON")
      console.warn(e)
    }
  }
  reader.readAsText(event.target.files[0])
}

</script>

<template>
  <div class="loader">
    <div class="form">
      <form @submit.prevent="submitHandler">
        <div class="title">{{ title }}</div>
        <div class="inputContainer">
          <div class="fieldRow" ref="fieldRow">
            <input type="text" :value="query" :placeholder="initName"
                   @input="onNameInput" @focus="onNameFocus"
                   @keydown="onNameKeydown" class="input" id="object"
                   role="combobox" aria-autocomplete="list" aria-haspopup="listbox"
                   aria-controls="object-suggestions"
                   :aria-expanded="suggestionsOpen ? 'true' : 'false'"
                   :aria-activedescendant="highlightedIndex >= 0 ? 'object-suggestion-' + highlightedIndex : undefined"
                   autocomplete="off" spellcheck="false"/>
            <div class="cut"></div>
            <label for="object" class="placeholder">Netspoc-Objekt</label>
            <ul class="suggestions" id="object-suggestions" role="listbox"
                aria-label="Netspoc-Objekte" ref="suggestionList" v-if="suggestionsOpen">
              <li v-for="(suggestion, i) in suggestions" :key="suggestion"
                  :id="'object-suggestion-' + i" role="option"
                  :aria-selected="i === highlightedIndex ? 'true' : 'false'"
                  :class="{ highlighted: i === highlightedIndex }"
                  @pointerdown="onSuggestionPointerDown($event, suggestion)"
                  @click="selectSuggestion(suggestion)"
                  @mouseenter="highlightedIndex = i">
                <span class="suggestion-name">{{ suggestion }}</span>
                <span class="suggestion-type">{{ typeOf(suggestion) }}</span>
              </li>
            </ul>
          </div>
          <label class="switch">
            <input type="checkbox" v-model="node.v6" id="v6" class="hidden"/>
            <span class="slider round"/>
            <p>IPv6</p>
          </label>
          
          <input type="text" class="input" id="source" style="width: 49%" :placeholder="path.source"
                 v-if="initName" @input="e => path.source = e.target.value"/>
          <input type="text" class="input" id="destination" style="width: 49%; margin-left: 5px;"
                 :placeholder="path.destination" v-if="initName"
                 @input="e => path.destination = e.target.value"/><br>
          <button class="submit" type="submit" :style="style">Anzeigen</button>
          <label for="file-upload" v-if="initName" class="submit loadFile">JSON Laden</label>
          <input id="file-upload" type="file" @change="onFileChanged" accept="application/json" class="hidden"/>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.loader {
  z-index: 10;
  background-color: rgba(1, 1, 1, 0.5);
}

.form {
  background-color: #cecece;
  box-shadow: 0 0 5px #ff4212;
  border-radius: 5px;
  padding: 0 10px 18px;
  z-index: 10;
  height: auto;
  width: min(720px, calc(100vw - 24px));
  overflow: visible;
}

.title {
  color: #303245;
  width: 100%;
  font-family: sans-serif;
  font-size: 36px;
  font-weight: 600;
  margin-top: 30px;
  margin-bottom: 0.5em;
  padding: 0.5em 1em;
  border-radius: 12px;
}

.inputContainer {
  width: 100%;
}

.fieldRow {
  height: 50px;
  position: relative;
  width: 100%;
  margin-bottom: 14px;
}

.input {
  background-color: #303245;
  border-radius: 12px;
  border: 0;
  box-sizing: border-box;
  color: #eee;
  font-size: 18px;
  height: 50px;
  outline: 0;
  padding: 4px 20px 0;
  width: 100%;

  &::placeholder {
    display: block;
  }

  -ms-user-select: none;
  -webkit-user-select: none;
  user-select: none;
}

.cut {
  background-color: var(--bodyBgColor);
  border-radius: 10px;
  height: 20px;
  left: 20px;
  position: absolute;
  top: -20px;
  transform: translateY(8px);
  transition: transform 200ms;
  width: 102px;
  z-index: 0;
}

.input:focus ~ .cut,
.input:not(:placeholder-shown) ~ .cut {
  transform: translateY(8px);
  z-index: 0;
}

.placeholder {
  color: #808097;
  font-family: sans-serif;
  left: 20px;
  line-height: 14px;
  pointer-events: none;
  position: absolute;
  transform-origin: 0 50%;
  transition: transform 200ms, color 200ms;
  top: 20px;
  transform: translateY(-30px) translateX(10px) scale(0.75);
}

.input:focus ~ .placeholder {
  color: var(--buttonColor);
}

.submit {
  background-color: var(--buttonColor);
  border-radius: 12px;
  border: 0;
  box-sizing: border-box;
  color: #eee;
  cursor: pointer;
  font-size: 18px;
  height: 50px;
  margin-top: 5px;
  text-align: center;
}

.submit:active {
  background-color: var(--buttonActiveColor);
}

.loadFile {
  margin-left: 5px;
  padding: 15px 0;
  display: inline-block;
  width: 49%;
}

/* Autocomplete suggestions for the object name field */
.suggestions {
  position: absolute;
  top: 50px;
  left: 0;
  right: 0;
  z-index: 30;
  margin: 0;
  padding: 4px 0;
  list-style: none;
  background-color: #303245;
  border-radius: 0 0 12px 12px;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.45);
  max-height: 300px;
  overflow-y: auto;
  overscroll-behavior: contain;
  touch-action: pan-y;
  -webkit-overflow-scrolling: touch;
}

.suggestions li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 16px;
  color: #eee;
  cursor: pointer;
  font-size: 16px;
}

.suggestions li.highlighted,
.suggestions li:hover {
  background-color: var(--buttonActiveColor);
}

.suggestion-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.suggestion-type {
  color: #aab3c0;
  font-size: 12px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  white-space: nowrap;
}

.switch {
  position: relative;
  display: grid;
  grid-template-columns: 1fr 64px;
  grid-template-rows: 34px;
  grid-template-areas: "ipv6 switch";
  margin-top: 5px;
  align-items: center;
}

/* Hide default HTML checkbox */
.hidden {
  opacity: 0;
  width: 0;
  height: 0;
}

/* The slider */
.slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #bebebe;
  -webkit-transition: .4s;
  transition: .4s;
  grid-area: switch;
}

.slider:before {
  position: absolute;
  content: "";
  height: 26px;
  width: 26px;
  left: 4px;
  bottom: 4px;
  background-color: #efefef;
  -webkit-transition: .4s;
  transition: .4s;
}

input:checked + .slider {
  background: var(--buttonColor);
  transition: 1s color;
}

input:focus + .slider {
  border: 50px black;
  box-shadow: 0 0 5px #303245;
}

input:checked + .slider:before {
  transform: translateX(26px);
}

/* Rounded sliders */
.slider.round {
  border-radius: 24px;
}

.slider.round:before {
  border-radius: 50%;
}

.switch p {
  height: 30px;
  display: flex;
  justify-content: flex-end;
  bottom: 0;
  margin-right: 0;
  align-items: center;
  grid-area: ipv6;
}
</style>