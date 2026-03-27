#!/usr/bin/env zx

/**
 * patch-gateway-thinking.mjs
 *
 * Patches the OpenClaw Gateway and ACP runtime to enable
 * real-time streaming of thinking content.
 *
 * This script modifies two files:
 * 1. manager.runtime.js - to emit thinking events from the ACP runtime
 * 2. gateway-cli.js - to handle thinking events in the chat delta handler
 */

import 'zx/globals';

const ROOT = path.resolve(__dirname, '..');
const BUNDLE_DIR = path.join(ROOT, 'build', 'openclaw');
const DIST_DIR = path.join(BUNDLE_DIR, 'dist');

function patchManagerRuntime() {
  echo`🩹 Patching manager.runtime to emit thinking events...`;

  const managerFiles = fs.readdirSync(DIST_DIR).filter(f =>
    f.startsWith('manager.runtime-') && f.endsWith('.js')
  );

  if (managerFiles.length === 0) {
    echo`❌ No manager.runtime file found in ${DIST_DIR}`;
    return false;
  }

  // Find the file that contains createAcpVisibleTextAccumulator
  let managerFile = null;
  for (const f of managerFiles) {
    const fp = path.join(DIST_DIR, f);
    const content = fs.readFileSync(fp, 'utf8');
    if (content.includes('createAcpVisibleTextAccumulator')) {
      managerFile = fp;
      echo`   Found: ${managerFile}`;
      break;
    }
  }

  if (!managerFile) {
    echo`❌ Could not find manager.runtime file with createAcpVisibleTextAccumulator`;
    return false;
  }

  let content = fs.readFileSync(managerFile, 'utf8');

  // Find the onEvent handler in acpManager.runTurn
  // We need to add handling for thinking events
  const onEventPattern = /onEvent: \(event\) => \{[\s\S]*?if \(event\.type === "done"\) \{[\s\S]*?return;\s*\}[\s\S]*?if \(event\.type !== "text_delta"\) return;/;

  if (!onEventPattern.test(content)) {
    echo`❌ Could not find onEvent pattern in manager.runtime`;
    return false;
  }

  // Replace the text_delta-only handler with one that also handles thinking events
  const newOnEventHandler = `onEvent: (event) => {
                        if (event.type === "done") {
                            stopReason = event.stopReason;
                            return;
                        }
                        // Handle thinking events
                        if (event.type === "thinking_delta" || event.type === "thinking_start") {
                            const thinkingText = event.thinking || event.text || "";
                            if (thinkingText) {
                                emitAgentEvent({
                                    runId,
                                    stream: "assistant",
                                    data: {
                                        thinking: thinkingText,
                                        delta: event.delta || thinkingText,
                                        thinkingDelta: true
                                    }
                                });
                            }
                            return;
                        }
                        if (event.type !== "text_delta") return;`;

  const modifiedContent = content.replace(
    onEventPattern,
    newOnEventHandler
  );

  if (modifiedContent === content) {
    echo`❌ Failed to apply manager.runtime patch - content unchanged`;
    return false;
  }

  fs.writeFileSync(managerFile, modifiedContent, 'utf8');
  echo`✅ Manager runtime patch applied successfully`;
  return true;
}

function patchGatewayCli() {
  echo`🩹 Patching gateway-cli to handle thinking events...`;

  const gatewayFiles = fs.readdirSync(DIST_DIR).filter(f =>
    f.startsWith('gateway-cli-') && f.endsWith('.js')
  );

  if (gatewayFiles.length === 0) {
    echo`❌ No gateway-cli file found in ${DIST_DIR}`;
    return false;
  }

  const gatewayFile = path.join(DIST_DIR, gatewayFiles[0]);
  echo`   Found: ${gatewayFile}`;

  let content = fs.readFileSync(gatewayFile, 'utf8');

  // Find the assistant stream handler that calls emitChatDelta
  const streamHandlerPattern = /if \(!isAborted && evt\.stream === "assistant" && typeof evt\.data\?\.text === "string"\)[\s\S]*?emitChatDelta\(sessionKey, clientRunId, evt\.runId, evt\.seq, evt\.data\.text, evt\.data\.delta\);/;

  if (!streamHandlerPattern.test(content)) {
    echo`❌ Could not find assistant stream handler pattern in gateway-cli`;
    return false;
  }

  // Add a handler for thinking content after the text delta handler
  const thinkingHandler = `
            if (!isAborted && evt.stream === "assistant" && evt.data?.thinkingDelta && evt.data?.thinking) {
                const thinkingPayload = {
                    runId: clientRunId,
                    sessionKey,
                    seq: evt.seq,
                    state: "delta",
                    message: {
                        role: "assistant",
                        content: [{
                            type: "thinking",
                            thinking: evt.data.thinking
                        }],
                        timestamp: Date.now()
                    }
                };
                broadcast("chat", thinkingPayload, { dropIfSlow: true });
                nodeSendToSession(sessionKey, "chat", thinkingPayload);
            }`;

  const modifiedContent = content.replace(
    streamHandlerPattern,
    (match) => match + thinkingHandler
  );

  if (modifiedContent === content) {
    echo`❌ Failed to apply gateway-cli patch - content unchanged`;
    return false;
  }

  fs.writeFileSync(gatewayFile, modifiedContent, 'utf8');
  echo`✅ Gateway CLI patch applied successfully`;
  return true;
}

// Run both patches
const managerSuccess = patchManagerRuntime();
const gatewaySuccess = patchGatewayCli();

if (!managerSuccess || !gatewaySuccess) {
  echo`❌ One or more patches failed`;
  process.exit(1);
}

echo`✅ All thinking streaming patches applied successfully`;