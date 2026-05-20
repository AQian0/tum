import { createApp } from "vue";
import { createSessionTransport, initSessionStore } from "@tum/core";
import App from "./App.vue";
import SessionWorkspace from "./components/SessionWorkspace.vue";
import TerminalPane from "./components/TerminalPane.vue";
import WorkspaceNewTabButton from "./components/WorkspaceNewTabButton.vue";
import WorkspaceTab from "./components/WorkspaceTab.vue";
import "dockview-vue/dist/styles/dockview.css";
import "./assets/main.css";

const transport = createSessionTransport();
initSessionStore(transport);

const app = createApp(App);
app.component("SessionWorkspace", SessionWorkspace);
app.component("TerminalPane", TerminalPane);
app.component("WorkspaceNewTabButton", WorkspaceNewTabButton);
app.component("WorkspaceTab", WorkspaceTab);
app.mount("#app");
