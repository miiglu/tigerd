/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/
/*--------------------------------------------------------------------------------------
 *  Tigerd — based on Tigerd Editor by Glass Devtools, Inc.
 *  Modifications Copyright 2026 Miiglu. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/


import { SendLLMMessageParams, OnText, OnFinalMessage, OnError } from '../../common/sendLLMMessageTypes.js';
import { IMetricsService } from '../../common/metricsService.js';
import { displayInfoOfProviderName } from '../../common/tigerdSettingsTypes.js';
import type { Part } from '../../common/sendLLMMessageTypes.js';

// Get agent URL - use IPC in renderer, default port in main process
const getTigerdAgentUrl = (): string => {
	// In main process, we can access the port from tigerdAgent
	// In renderer, we'll call via IPC - but this file should only be used in main
	return `http://localhost:4096`;
};



// Get current agent session ID - exported for abort
export const getAgentSessionId = () => agentSessionId;

// Abort a running tigerd-agent session
export const abortAgentSession = async (sessionId: string, workingDir?: string): Promise<boolean> => {
	const agentUrl = getTigerdAgentUrl();
	try {
		const headers: Record<string, string> = { 'Content-Type': 'application/json' };
		if (workingDir) {
			headers['x-opencode-directory'] = workingDir;
		}
		const response = await fetch(`${agentUrl}/session/${sessionId}/abort`, {
			method: 'POST',
			headers,
		});
		if (response.ok) {
			console.log('[TigerdAgent] Session aborted:', sessionId);
			return true;
		}
		return false;
	} catch (error) {
		console.log('[TigerdAgent] Error aborting session:', error);
		return false;
	}
}

// Create a new tigerd-agent session
export const createAgentSession = async (workingDir?: string): Promise<string | null> => {
	const agentUrl = getTigerdAgentUrl();
	try {
		const response = await fetch(`${agentUrl}/session`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				directory: workingDir || process.cwd(),
			}),
		});
		if (response.ok) {
			const session = await response.json();
			console.log('[TigerdAgent] Created session:', session.id);
			return session.id;
		}
		console.log('[TigerdAgent] Failed to create session:', response.status);
		return null;
	} catch (error) {
		console.log('[TigerdAgent] Error creating session:', error);
		return null;
	}
}

// ------------ TIGERD-AGENT ROUTING ------------

let agentSessionId: string | null = null;
let agentWorkingDir: string | null = null;


const FORCE_NEW_SESSION = false;

// Streaming handler for tigerd-agent responses
const sendToTigerdAgent = async ({
	messages,
	onText,
	onDiff,
	onQuestion,
	onPermission,
	onFinalMessage,
	onError,
	workspaceFolder,
	modelSelection,
	onToolCall,
	onThinking,
	chatMode,
	sessionId,
}: {
	messages: any[];
	onText: OnText;
	onDiff?: (p: { diffs: any[] }) => void;
	onQuestion?: (p: { requestId: string; questions: any[] }) => void;
	onPermission?: (p: { requestId: string; permission: any }) => void;
	onFinalMessage: OnFinalMessage;
	onError: OnError;
	workspaceFolder?: string;
	modelSelection?: { providerName: string; modelName: string };
	onToolCall?: (toolCall: any) => void;
	onThinking?: (thinking: string) => void;
	chatMode?: string;
	sessionId?: string;
}) => {
	const agentUrl = getTigerdAgentUrl();
	const currentWorkingDir = workspaceFolder || process.cwd();

	// Format model for tigerd-agent: providerName/modelName (e.g., "opencode/big-pickle")
	const modelId = modelSelection ? `${modelSelection.providerName}/${modelSelection.modelName}` : 'opencode/big-pickle';

	try {
		// Get only the user's actual message - don't send system messages to tigerd-agent
		// tigerd-agent has its own powerful system prompt with tools
		const userMessages = messages.filter((m: any) => m.role === 'user');
		const lastMessage = userMessages[userMessages.length - 1];
		const userMessage = lastMessage?.parts?.[0]?.text || lastMessage?.content || '';

		console.log('[TigerdAgent] Sending message:', userMessage);
		console.log('[TigerdAgent] workspaceFolder:', workspaceFolder);
		console.log('[TigerdAgent] currentWorkingDir:', currentWorkingDir);
		console.log('[TigerdAgent] model:', modelId);
		console.log('[TigerdAgent] sessionId param received:', sessionId);

		// Reuse existing session if working directory hasn't changed, otherwise create new
		// Use provided sessionId if available, otherwise use/create global session
		let currentSessionId = sessionId;
		console.log('[TigerdAgent] After line 135, currentSessionId:', currentSessionId, 'provided sessionId:', sessionId);

		if (!currentSessionId) {
			console.log('[TigerdAgent] No sessionId provided - using/creating global session');
			// No sessionId provided, use or create global session
			if (FORCE_NEW_SESSION) {
				agentSessionId = null;
			}
			if (!agentSessionId || agentWorkingDir !== currentWorkingDir) {
				if (agentSessionId) {
					console.log('[TigerdAgent] Working dir changed, creating new session');
				}

				// Create a new session with the current working directory
				// Use x-opencode-directory header to set the session's working directory
				const sessionResponse = await fetch(`${agentUrl}/session`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'x-opencode-directory': currentWorkingDir,
					},
					body: JSON.stringify({ directory: currentWorkingDir }),
				});

				if (!sessionResponse.ok) {
					const errorText = await sessionResponse.text();
					throw new Error(`Failed to create session: ${sessionResponse.status} - ${errorText}`);
				}

				const session = await sessionResponse.json();
				agentSessionId = session.id;
				agentWorkingDir = currentWorkingDir;

				console.log('[TigerdAgent] Session created (global fallback):', agentSessionId);
			}
			currentSessionId = agentSessionId ?? undefined;
			console.log('[TigerdAgent] Using global fallback session:', currentSessionId);
		} else {
			console.log('[TigerdAgent] Using provided sessionId:', currentSessionId);
		}

		// Set the model for this session
		if (modelSelection && currentSessionId) {
			const modelResponse = await fetch(`${agentUrl}/session/${currentSessionId}/model`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-opencode-directory': currentWorkingDir,
				},
				body: JSON.stringify({
					providerID: modelSelection.providerName,
					modelID: modelSelection.modelName,
				}),
			});
			if (modelResponse.ok) {
				console.log('[TigerdAgent] Model set:', modelId);
			} else {
				console.log('[TigerdAgent] Model set failed:', await modelResponse.text());
			}
		}

		if (!currentSessionId) {
			currentSessionId = agentSessionId ?? undefined;
		}
		console.log('[TigerdAgent] Using session:', currentSessionId);

		// Send message with the correct format - let tigerd-agent use its own system message
		// (it's more powerful with tool definitions, capabilities, etc.)
		const requestBody: any = {
			parts: [
				{ type: 'text', text: userMessage }
			]
		};

		// Map Tigerd ChatMode to opencode agent:
		// - 'agent' (full execution) -> 'build' (default)
		// - 'gather' (read-only exploration) -> 'explore'
		// - 'normal' -> 'build'
		const chatModeToAgent: Record<string, string> = {
			'agent': 'build',
			'gather': 'explore',
			'normal': 'build',
		};
		const agentName = chatModeToAgent[chatMode || 'agent'] || 'build';
		requestBody.agent = agentName;
		console.log('[TigerdAgent] Using agent:', agentName, 'for chatMode:', chatMode);

		// Include model in each message request to ensure it's used
		if (modelSelection) {
			requestBody.model = {
				providerID: modelSelection.providerName,
				modelID: modelSelection.modelName,
			};
		}

		// SSE STREAMING: Connect to /event endpoint and listen for message.part.updated events
		// This provides real-time streaming of text, reasoning, tool calls, etc.

		// Use fetch with ReadableStream to handle SSE in Node.js
		const eventUrl = `${agentUrl}/event?sessionID=${currentSessionId}`;
		console.log('[TigerdAgent] Connecting to SSE:', eventUrl);

		let currentMessageId: string | null = null;

		let fullText = '';
		let fullReasoning = '';
		let fullThinking = ''; // For streaming "Thinking..." indicator
		let parts: Part[] = []; // All parts for sequential rendering
		let resolved = false;

		// Timeout tracking - will be set after message is sent
		let timeoutId: NodeJS.Timeout | null = null;
		const cancelTimeout = () => {
			if (timeoutId) {
				clearTimeout(timeoutId);
				timeoutId = null;
			}
		};

		// Create an AbortController for cancelling
		const abortController = new AbortController();

		// Fetch SSE stream
		const response = await fetch(eventUrl, {
			method: 'GET',
			headers: {
				'Accept': 'text/event-stream',
				'Cache-Control': 'no-cache',
				'x-opencode-directory': currentWorkingDir,
			},
			signal: abortController.signal,
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`Failed to connect to event stream: ${response.status} - ${errorText}`);
		}

		if (!response.body) {
			throw new Error('No response body for SSE');
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';

		// Process the SSE stream
		const processSSE = async () => {
			try {
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;

					const chunk = decoder.decode(value, { stream: true });
					buffer += chunk;

					// Process complete SSE events (separated by double newlines)
					const events = buffer.split('\n\n');
					buffer = events.pop() || ''; // Keep incomplete event in buffer

					for (const event of events) {
						if (!event.trim()) continue;

						// Parse SSE format: "data: {...}"
						const lines = event.split('\n');
						for (const line of lines) {
							if (!line.startsWith('data: ')) continue;

							const jsonStr = line.slice(6); // Remove 'data: ' prefix
							try {
								const data = JSON.parse(jsonStr);
								console.log('[TigerdAgent] SSE Event:', data.type, data.properties?.part?.type);

								// Handle message part updated - streaming event
								if (data.type === 'message.part.updated') {
									const { part, delta } = data.properties as { part: Part; delta?: string };

									if (!currentMessageId && part.messageID) {
										currentMessageId = part.messageID;
										console.log('[TigerdAgent] Message started:', currentMessageId);
									}

									// Handle different part types - add to parts array
									if (part.type === 'text') {
										// Update or add text part
										const existingIdx = parts.findIndex(p => p.id === part.id);
										if (existingIdx >= 0) {
											(parts[existingIdx] as any).text += delta || '';
										} else {
											parts.push({ ...part, text: delta || part.text || '' });
										}
										fullText = parts.filter(p => p.type === 'text').map(p => (p as any).text).join('');
										console.log('[TigerdAgent] Text update, length:', fullText.length);
										onText({ fullText, fullReasoning, thinkingSoFar: fullThinking, toolCall: undefined, parts: [...parts] });
									}

									// Reasoning - update existing or add new
									if (part.type === 'reasoning') {
										const partAny = part as any;
										const reasoningContent = delta || partAny.text || partAny.thinking || '';
										if (reasoningContent) {
											// Check if reasoning part with same ID exists - update it
											const existingIdx = parts.findIndex(p => p.id === part.id && p.type === 'reasoning');
											if (existingIdx >= 0) {
												// Update existing reasoning part
												(parts[existingIdx] as any).text = reasoningContent;
											} else {
												// Add new reasoning part only if it's new
												const newReasoningPart = {
													...part,
													text: reasoningContent,
												} as Part;
												parts.push(newReasoningPart);
											}

											fullReasoning = parts.filter(p => p.type === 'reasoning').map(p => (p as any).text).join('\n\n---\n\n');
											fullThinking = fullReasoning;
											console.log('[TigerdAgent] Reasoning part added, total parts:', parts.length);
											onThinking?.(reasoningContent);
											onText({ fullText, fullReasoning, thinkingSoFar: fullThinking, toolCall: undefined, parts: [...parts] });
										}
									}

									if (part.type === 'tool') {
										// Map opencode tool names to Tigerd tool names
										const toolNameMap: Record<string, string> = {
											'apply_patch': 'edit_file',
											'edit': 'edit_file',
											'multiedit': 'edit_file',
											'write': 'rewrite_file',
											'question': 'question',
											'read': 'read',
											'bash': 'bash',
											'ls': 'list',
											'list': 'list',
											'glob': 'grep',
											'grep': 'grep',
										};
										const toolPart = part as any;
										const mappedToolName = toolNameMap[toolPart.tool] || toolPart.tool;

										// Update part with mapped tool name
										const mappedPart = { ...part, tool: mappedToolName };

										// Tool - update or add to parts
										const existingIdx = parts.findIndex(p => p.id === part.id);
										if (existingIdx >= 0) {
											parts[existingIdx] = mappedPart;
										} else {
											parts.push(mappedPart);
										}
										console.log('[TigerdAgent] Tool part updated:', mappedToolName, 'total parts:', parts.length);

										// Get tool parameters
										const toolInput = toolPart.input || toolPart.args || {};
										const rawParams = typeof toolInput === 'string' ? JSON.parse(toolInput || '{}') : toolInput;

										// Transform to RawToolCallObj format
										const toolCallObj = {
											name: mappedToolName,
											rawParams: rawParams,
											doneParams: toolPart.state?.status === 'completed' ? ['*'] : [],
											id: part.id || `tool_${Date.now()}`,
											isDone: toolPart.state?.status === 'completed' || toolPart.state?.status === 'error',
										};

										onText({ fullText, fullReasoning, thinkingSoFar: fullThinking, toolCall: toolCallObj, parts: [...parts] });
									}

									// Handle step events
									if ((part as any).type === 'step-start') {
										console.log('[TigerdAgent] Step start:', (part as any).snapshot?.substring(0, 50));
									}

									if ((part as any).type === 'step-finish') {
										console.log('[TigerdAgent] Step finish, reason:', (part as any).reason);
									}
								}

								// Handle session status changes
								if (data.type === 'session.status') {
									const { status } = data.properties;
									console.log('[TigerdAgent] Session status:', status);

									if (status === 'idle' && currentMessageId && !resolved) {
										resolved = true;
										cancelTimeout(); // Cancel the safety timeout
										console.log('[TigerdAgent] Session idle - complete');
										reader.cancel();
										onFinalMessage({ fullText, fullReasoning, thinkingSoFar: fullThinking, toolCall: undefined, anthropicReasoning: null });
										return;
									}

									if (status === 'error') {
										const errorMsg = data.properties.error?.message || 'Unknown error';
										console.log('[TigerdAgent] Session error:', errorMsg);
										reader.cancel();
										onError({ message: errorMsg, fullError: null });
										return;
									}
								}

								// Handle message created (final message)
								if (data.type === 'message.created') {
									console.log('[TigerdAgent] Message created:', data.properties?.message?.id);
									// Message is complete, but we wait for idle status
								}

								// Handle file changes (diff) - real-time file modifications
								if (data.type === 'session.diff') {
									const { diff, messageID } = data.properties;
									console.log('[TigerdAgent] File diff received, messageID:', messageID, 'files changed:', diff?.length);
									if (onDiff && diff) {
										onDiff({ diffs: diff });
									}
								}

								// Handle question - AI asking user for clarification
								if (data.type === 'question.asked') {
									const { questions, id } = data.properties;
									console.log('[TigerdAgent] Question asked, id:', id, 'questions:', JSON.stringify(questions));
									// Pass question info to UI via callback
									if (onQuestion) {
										onQuestion({ requestId: id, questions });
									}
								}

								// Handle permission request (user confirmation needed for tools)
								if (data.type === 'permission.asked') {
									const { permission, id } = data.properties;
									console.log('[TigerdAgent] Permission asked:', permission, 'id:', id);

									// Pass permission info to UI via callback instead of auto-approving
									if (onPermission) {
										onPermission({ requestId: id, permission });
									}
								}
							} catch (e) {
								console.error('[TigerdAgent] Error parsing event:', e);
							}
						}
					}
				}
			} catch (e) {
				if ((e as Error).name !== 'AbortError') {
					console.error('[TigerdAgent] SSE stream error:', e);
				}
			}
		};

		// Start processing SSE in background
		processSSE();

		// Send the message
		const messageResponse = await fetch(`${agentUrl}/session/${currentSessionId}/message`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-opencode-directory': currentWorkingDir,
			},
			body: JSON.stringify(requestBody),
		});

		if (!messageResponse.ok) {
			const errorText = await messageResponse.text();
			console.log('[TigerdAgent] Error response:', errorText);
			abortController.abort();
			throw new Error(`Agent request failed: ${messageResponse.status} - ${errorText}`);
		}

		console.log('[TigerdAgent] Message sent, waiting for events...');

		// For safety, set a timeout - but cancel it when session goes idle
		timeoutId = setTimeout(() => {
			if (currentMessageId && !resolved) {
				console.log('[TigerdAgent] Timeout reached, finalizing...');
				abortController.abort();
				onFinalMessage({ fullText, fullReasoning, thinkingSoFar: fullThinking, toolCall: undefined, anthropicReasoning: null });
			}
		}, 60000); // 60 second timeout

		return;

	} catch (error) {
		onError({
			message: error instanceof Error ? error.message : 'Tigerd-agent error',
			fullError: error,
		});
	}
};


export const sendLLMMessage = async ({
	messagesType,
	messages: messages_,
	onText: onText_,
	onDiff,
	onQuestion,
	onPermission,
	onFinalMessage: onFinalMessage_,
	onError: onError_,
	abortRef: abortRef_,
	logging: { loggingName, loggingExtras },
	settingsOfProvider,
	modelSelection,
	modelSelectionOptions,
	overridesOfModel,
	chatMode,
	separateSystemMessage,
	mcpTools,
	workspaceFolder,
	authToken,
	isAuthenticated,
	sessionId,
}: SendLLMMessageParams,

	metricsService: IMetricsService
) => {

	console.log('[sendLLMMessage] Called with - messagesType:', messagesType, 'sessionId:', sessionId, 'workspaceFolder:', workspaceFolder);

	// Fallback to opencode/big-pickle if no model selected
	const effectiveModelSelection = modelSelection ?? { providerName: 'opencode', modelName: 'big-pickle' };
	const { providerName, modelName } = effectiveModelSelection

	// only captures number of messages and message "shape", no actual code, instructions, prompts, etc
	const captureLLMEvent = (eventId: string, extras?: object) => {


		metricsService.capture(eventId, {
			providerName,
			modelName,
			customEndpointURL: settingsOfProvider[providerName]?.endpoint,
			numModelsAtEndpoint: settingsOfProvider[providerName]?.models?.length,
			...messagesType === 'chatMessages' ? {
				numMessages: messages_?.length,
			} : messagesType === 'FIMMessage' ? {
				prefixLength: messages_.prefix.length,
				suffixLength: messages_.suffix.length,
			} : {},
			...loggingExtras,
			...extras,
		})
	}
	const submit_time = new Date()

	let _fullTextSoFar = ''
	let _aborter: (() => void) | null = null
	let _setAborter = (fn: () => void) => { _aborter = fn }
	let _didAbort = false

	const onText: OnText = (params) => {
		const { fullText } = params
		if (_didAbort) return
		onText_(params)
		_fullTextSoFar = fullText
	}

	const onFinalMessage: OnFinalMessage = (params) => {
		const { fullText, fullReasoning, toolCall } = params
		if (_didAbort) return
		captureLLMEvent(`${loggingName} - Received Full Message`, { messageLength: fullText.length, reasoningLength: fullReasoning?.length, duration: new Date().getMilliseconds() - submit_time.getMilliseconds(), toolCallName: toolCall?.name })
		onFinalMessage_(params)
	}

	const onError: OnError = ({ message: errorMessage, fullError }) => {
		if (_didAbort) return
		console.error('sendLLMMessage onError:', errorMessage)

		// handle failed to fetch errors, which give 0 information by design
		if (errorMessage === 'TypeError: fetch failed')
			errorMessage = `Failed to fetch from ${displayInfoOfProviderName(providerName).title}. This likely means you specified the wrong endpoint in Tigerd's Settings, or your local model provider like Ollama is powered off.`

		captureLLMEvent(`${loggingName} - Error`, { error: errorMessage })
		onError_({ message: errorMessage, fullError })
	}

	// we should NEVER call onAbort internally, only from the outside
	const onAbort = () => {
		captureLLMEvent(`${loggingName} - Abort`, { messageLengthSoFar: _fullTextSoFar.length })
		try { _aborter?.() } // aborter sometimes automatically throws an error
		catch (e) { }
		_didAbort = true
	}
	abortRef_.current = onAbort


	if (messagesType === 'chatMessages')
		captureLLMEvent(`${loggingName} - Sending Message`, {})
	else if (messagesType === 'FIMMessage')
		captureLLMEvent(`${loggingName} - Sending FIM`, { prefixLen: messages_?.prefix?.length, suffixLen: messages_?.suffix?.length })


	try {
		// Check if tigerd-agent is running AND user is authenticated
		// Agent requires authentication to function properly
		// Assume agent is running when using this module in electron-main
		const agentRunning = true;
		console.log('[TigerdAgent] Checking route - messagesType:', messagesType, 'agentRunning:', agentRunning, 'isAuthenticated:', isAuthenticated);
		const useTigerdAgent = messagesType === 'chatMessages' && agentRunning && isAuthenticated;

		if (useTigerdAgent) {
			console.log('[TigerdAgent] Routing to agent...');
			await sendToTigerdAgent({
				messages: messages_,
				onText,
				onDiff,
				onQuestion,
				onPermission,
				onFinalMessage,
				onError,
				workspaceFolder,
				modelSelection: { providerName, modelName },
				chatMode: chatMode ?? undefined,
				sessionId,
				onToolCall: (toolCall) => {
					console.log('[TigerdAgent] Tool call received:', toolCall);
				},
				onThinking: (thinking) => {
					console.log('[TigerdAgent] Thinking:', thinking.substring(0, 100) + '...');
				},
			});
			return;
		}

		// opencode provider requires authentication - show login prompt if not authenticated
		if (providerName === 'opencode') {
			if (!isAuthenticated) {
				onError({ message: 'Please log in to use Tigerd Agent. Click the account icon in the sidebar to sign in.', fullError: null });
			} else {
				onError({ message: 'Tigerd Agent is not available. Please select a different model.', fullError: null });
			}
			return;
		}

		// Dynamic import to avoid bundling SDKs in renderer
		const { sendLLMMessageToProviderImplementation } = await import('./sendLLMMessage.impl.js');
		const implementation = sendLLMMessageToProviderImplementation[providerName]
		if (!implementation) {
			onError({ message: `Error: Provider "${providerName}" not recognized.`, fullError: null })
			return
		}
		const { sendFIM, sendChat } = implementation
		if (messagesType === 'chatMessages') {
			await sendChat({ messages: messages_, onText, onFinalMessage, onError, settingsOfProvider, modelSelectionOptions, overridesOfModel, modelName, _setAborter, providerName, separateSystemMessage, chatMode, mcpTools })
			return
		}
		if (messagesType === 'FIMMessage') {
			if (sendFIM) {
				await sendFIM({ messages: messages_, onText, onFinalMessage, onError, settingsOfProvider, modelSelectionOptions, overridesOfModel, modelName, _setAborter, providerName, separateSystemMessage })
				return
			}
			onError({ message: `Error running Autocomplete with ${providerName} - ${modelName}.`, fullError: null })
			return
		}
		onError({ message: `Error: Message type "${messagesType}" not recognized.`, fullError: null })
		return
	}

	catch (error) {
		if (error instanceof Error) { onError({ message: error + '', fullError: error }) }
		else { onError({ message: `Unexpected Error in sendLLMMessage: ${error}`, fullError: error }); }
		// ; (_aborter as any)?.()
		// _didAbort = true
	}



}

