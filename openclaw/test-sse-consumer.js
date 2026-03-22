/**
 * Smoke test for OpenClaw vibelearn plugin registration.
 * Validates the plugin structure works independently of the full OpenClaw runtime.
 *
 * Run: node test-sse-consumer.js
 */

import vibeLearnPlugin from "./dist/index.js";

let registeredService = null;
const registeredCommands = new Map();
const eventHandlers = new Map();
const logs = [];

const mockApi = {
  id: "vibelearn",
  name: "VibeLearn",
  version: "1.0.0",
  source: "/test/extensions/vibelearn/dist/index.js",
  config: {},
  pluginConfig: {},
  logger: {
    info: (message) => { logs.push(message); },
    warn: (message) => { logs.push(message); },
    error: (message) => { logs.push(message); },
    debug: (message) => { logs.push(message); },
  },
  registerService: (service) => {
    registeredService = service;
  },
  registerCommand: (command) => {
    registeredCommands.set(command.name, command);
  },
  on: (event, callback) => {
    if (!eventHandlers.has(event)) {
      eventHandlers.set(event, []);
    }
    eventHandlers.get(event).push(callback);
  },
  runtime: {
    channel: {
      telegram: { sendMessageTelegram: async () => {} },
      discord: { sendMessageDiscord: async () => {} },
      signal: { sendMessageSignal: async () => {} },
      slack: { sendMessageSlack: async () => {} },
      whatsapp: { sendMessageWhatsApp: async () => {} },
      line: { sendMessageLine: async () => {} },
    },
  },
};

// Call the default export with mock API
vibeLearnPlugin(mockApi);

// Verify registration
let failures = 0;

if (!registeredService) {
  console.error("FAIL: No service was registered");
  failures++;
} else if (registeredService.id !== "vibelearn-observation-feed") {
  console.error(
    `FAIL: Service ID is "${registeredService.id}", expected "vibelearn-observation-feed"`
  );
  failures++;
} else {
  console.log("OK: Service registered with id 'vibelearn-observation-feed'");
}

if (!registeredCommands.has("vibelearn-feed")) {
  console.error("FAIL: No 'vibelearn-feed' command registered");
  failures++;
} else {
  console.log("OK: Command registered with name 'vibelearn-feed'");
}

if (!registeredCommands.has("vibelearn-status")) {
  console.error("FAIL: No 'vibelearn-status' command registered");
  failures++;
} else {
  console.log("OK: Command registered with name 'vibelearn-status'");
}

const expectedEvents = ["before_agent_start", "tool_result_persist", "agent_end", "gateway_start"];
for (const event of expectedEvents) {
  if (!eventHandlers.has(event) || eventHandlers.get(event).length === 0) {
    console.error(`FAIL: No handler registered for '${event}'`);
    failures++;
  } else {
    console.log(`OK: Event handler registered for '${event}'`);
  }
}

if (!logs.some((l) => l.includes("plugin loaded"))) {
  console.error("FAIL: Plugin did not log a load message");
  failures++;
} else {
  console.log("OK: Plugin logged load message");
}

if (failures > 0) {
  console.error(`\nFAIL: ${failures} check(s) failed`);
  process.exit(1);
} else {
  console.log("\nPASS: Plugin registers service, commands, and event handlers correctly");
}
