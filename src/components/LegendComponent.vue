<script setup></script>

<template>
  <div class="legend">
    <h3>Legende</h3>
    <p class="managed-router">Managed Router</p>
    <p class="unmanaged-router">Unmanaged Router</p>
    <p class="network">Network</p>
    <p class="area">Area</p>
  </div>
</template>

<style scoped>
.legend {
  position: absolute;
  bottom: 0;
  right: 0;
  background: var(--bodyBgColor);
  box-shadow: 0 0 0.5em rgba(0, 0, 0, 1);
  z-index: 10;
  padding: 0.3em;
  border-radius: 0.5em;
  margin: 1em;
  font-size: 0.8em;
  -ms-user-select: none;
  -webkit-user-select: none;
  user-select: none;

  h3 {
    text-align: center;
    padding: 6px 10px;
    margin: 0.2em;
    border-radius: 0.5em;
    border: 0;
    background-color: var(--buttonColor);
    color: #eee;
  }
}

.managed-router {
  background-color: rgba(220, 20, 60, 0.5);
}

.unmanaged-router {
  background-color: rgba(128, 128, 128, 0.5);
}

.network {
  background-color: rgba(0, 0, 255, 0.5);
}

.area {
  background-color: rgba(0, 128, 0, 0.5);
}
p {
  margin: 0.5em;
  padding: 0.5em;
  border-radius: 0.5em;
}
</style>