import { createApp } from "vue";
import { createSessionTransport, initSessionStore } from "@tum/core";
import App from "./App.vue";
import TerminalPane from "./components/TerminalPane.vue";
import "dockview-vue/dist/styles/dockview.css";
import "./assets/main.css";

const transport = createSessionTransport();
initSessionStore(transport);

const app = createApp(App);
app.component("TerminalPane", TerminalPane);
app.mount("#app");
