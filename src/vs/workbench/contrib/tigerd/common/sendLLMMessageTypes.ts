/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/
/*--------------------------------------------------------------------------------------
 *  Tigerd — based on Tigerd Editor by Glass Devtools, Inc.
 *  Modifications Copyright 2026 Miiglu. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/


import { InternalToolInfo } from './prompt/prompts.js'
import { ToolName, ToolParamName } from './toolsServiceTypes.js'
import { ChatMode, ModelSelection, ModelSelectionOptions, OverridesOfModel, ProviderName, RefreshableProviderName, SettingsOfProvider } from './tigerdSettingsTypes.js'

// =====================================================
// PART TYPES FROM OPENCODE SDK (for streaming)
// =====================================================

// Tool State types
export type ToolStatePending = {
	status: 'pending';
	input: { [key: string]: unknown };
	raw: string;
};

export type ToolStateRunning = {
	status: 'running';
	input: { [key: string]: unknown };
	title?: string;
	metadata?: { [key: string]: unknown };
	time: { start: number };
};

export type ToolStateCompleted = {
	status: 'completed';
	input: { [key: string]: unknown };
	output: string;
	title: string;
	metadata: { [key: string]: unknown };
	time: { start: number; end: number; compacted?: number };
	attachments?: FilePart[];
};

export type ToolStateError = {
	status: 'error';
	input: { [key: string]: unknown };
	error: string;
	metadata?: { [key: string]: unknown };
	time: { start: number; end: number };
};

export type ToolState = ToolStatePending | ToolStateRunning | ToolStateCompleted | ToolStateError;

// Part types
export type TextPart = {
	id: string;
	sessionID: string;
	messageID: string;
	type: 'text';
	text: string;
	synthetic?: boolean;
	ignored?: boolean;
	time?: { start: number; end?: number };
	metadata?: { [key: string]: unknown };
};

export type ReasoningPart = {
	id: string;
	sessionID: string;
	messageID: string;
	type: 'reasoning';
	text: string;
	metadata?: { [key: string]: unknown };
	time: { start: number; end?: number };
};

export type FilePartSourceText = {
	value: string;
	start: number;
	end: number;
};

export type FileSource = {
	text: FilePartSourceText;
	type: 'file';
	path: string;
};

export type SymbolSource = {
	text: FilePartSourceText;
	type: 'symbol';
	path: string;
	range: { start: { line: number; character: number }; end: { line: number; character: number } };
	name: string;
	kind: number;
};

export type ResourceSource = {
	text: FilePartSourceText;
	type: 'resource';
	clientName: string;
	uri: string;
};

export type FilePartSource = FileSource | SymbolSource | ResourceSource;

export type FilePart = {
	id: string;
	sessionID: string;
	messageID: string;
	type: 'file';
	mime: string;
	filename?: string;
	url: string;
	source?: FilePartSource;
};

export type ToolPart = {
	id: string;
	sessionID: string;
	messageID: string;
	type: 'tool';
	callID: string;
	tool: string;
	state: ToolState;
	metadata?: { [key: string]: unknown };
};

export type StepStartPart = {
	id: string;
	sessionID: string;
	messageID: string;
	type: 'step-start';
	snapshot?: string;
};

export type StepFinishPart = {
	id: string;
	sessionID: string;
	messageID: string;
	type: 'step-finish';
	reason: string;
	snapshot?: string;
	cost: number;
	tokens: {
		total?: number;
		input: number;
		output: number;
		reasoning: number;
		cache: { read: number; write: number };
	};
};

export type SnapshotPart = {
	id: string;
	sessionID: string;
	messageID: string;
	type: 'snapshot';
	snapshot: string;
};

export type PatchPart = {
	id: string;
	sessionID: string;
	messageID: string;
	type: 'patch';
	hash: string;
	files: string[];
};

export type AgentPart = {
	id: string;
	sessionID: string;
	messageID: string;
	type: 'agent';
	agent: string;
	prompt: string;
};

export type RetryPart = {
	id: string;
	sessionID: string;
	messageID: string;
	type: 'retry';
	prompt: string;
};

export type CompactionPart = {
	id: string;
	sessionID: string;
	messageID: string;
	type: 'compaction';
	originalMessageIDs: string[];
};

export type SubtaskPart = {
	id: string;
	sessionID: string;
	messageID: string;
	type: 'subtask';
	prompt: string;
	description: string;
	agent: string;
	model?: { providerID: string; modelID: string };
	command?: string;
};

// Union of all part types
export type Part = TextPart | SubtaskPart | ReasoningPart | FilePart | ToolPart | StepStartPart | StepFinishPart | SnapshotPart | PatchPart | AgentPart | RetryPart | CompactionPart;

// Event types
export type EventMessagePartUpdated = {
	type: 'message.part.updated';
	properties: {
		part: Part;
		delta?: string;
	};
};


export const errorDetails = (fullError: Error | null): string | null => {
	if (fullError === null) {
		return null
	}
	else if (typeof fullError === 'object') {
		if (Object.keys(fullError).length === 0) return null
		return JSON.stringify(fullError, null, 2)
	}
	else if (typeof fullError === 'string') {
		return null
	}
	return null
}

export const getErrorMessage: (error: unknown) => string = (error) => {
	if (error instanceof Error) return `${error.name}: ${error.message}`
	return error + ''
}



export type AnthropicLLMChatMessage = {
	role: 'assistant',
	content: string | (AnthropicReasoning | { type: 'text'; text: string }
		| { type: 'tool_use'; name: string; input: Record<string, any>; id: string; }
	)[];
} | {
	role: 'user',
	content: string | (
		{ type: 'text'; text: string; } | { type: 'tool_result'; tool_use_id: string; content: string; }
	)[]
}
export type OpenAILLMChatMessage = {
	role: 'system' | 'user' | 'developer';
	content: string;
} | {
	role: 'assistant',
	content: string | (AnthropicReasoning | { type: 'text'; text: string })[];
	tool_calls?: { type: 'function'; id: string; function: { name: string; arguments: string; } }[];
} | {
	role: 'tool',
	content: string;
	tool_call_id: string;
}

export type GeminiLLMChatMessage = {
	role: 'model'
	parts: (
		| { text: string; }
		| { functionCall: { id: string; name: ToolName, args: Record<string, unknown> } }
	)[];
} | {
	role: 'user';
	parts: (
		| { text: string; }
		| { functionResponse: { id: string; name: ToolName, response: { output: string } } }
	)[];
}

export type LLMChatMessage = AnthropicLLMChatMessage | OpenAILLMChatMessage | GeminiLLMChatMessage



export type LLMFIMMessage = {
	prefix: string;
	suffix: string;
	stopTokens: string[];
}


export type RawToolParamsObj = {
	[paramName in ToolParamName<ToolName>]?: string;
}
export type RawToolCallObj = {
	name: ToolName;
	rawParams: RawToolParamsObj;
	doneParams: ToolParamName<ToolName>[];
	id: string;
	isDone: boolean;
};

export type AnthropicReasoning = ({ type: 'thinking'; thinking: any; signature: string; } | { type: 'redacted_thinking', data: any })

// Real-time file diff from opencode
export type FileDiff = {
	file: string;
	before: string;
	after: string;
	additions: number;
	deletions: number;
	status?: 'added' | 'deleted' | 'modified';
}

// Streaming parts array - allows sequential rendering like opencode
export type OnText = (p: { 
	fullText: string; 
	fullReasoning: string; 
	thinkingSoFar?: string; 
	toolCall?: RawToolCallObj; 
	parts?: Part[]  // All parts for sequential rendering
}) => void
export type OnDiff = (p: { diffs: FileDiff[] }) => void
export type OnQuestion = (p: { requestId: string; questions: any[] }) => void  // Called when AI asks a question
export type OnPermission = (p: { requestId: string; permission: any }) => void  // Called when AI needs permission for a tool
export type OnFinalMessage = (p: { fullText: string; fullReasoning: string; thinkingSoFar?: string; toolCall?: RawToolCallObj; anthropicReasoning: AnthropicReasoning[] | null; parts?: Part[] }) => void // id is tool_use_id
export type OnError = (p: { message: string; fullError: Error | null }) => void
export type OnAbort = () => void
export type AbortRef = { current: (() => void) | null }


// service types
type SendLLMType = {
	messagesType: 'chatMessages';
	messages: LLMChatMessage[]; // the type of raw chat messages that we send to Anthropic, OAI, etc
	separateSystemMessage: string | undefined;
	chatMode: ChatMode | null;
} | {
	messagesType: 'FIMMessage';
	messages: LLMFIMMessage;
	separateSystemMessage?: undefined;
	chatMode?: undefined;
}
export type ServiceSendLLMMessageParams = {
	onText: OnText;
	onDiff?: OnDiff;
	onQuestion?: OnQuestion;
	onPermission?: OnPermission;
	onFinalMessage: OnFinalMessage;
	onError: OnError;
	logging: { loggingName: string, loggingExtras?: { [k: string]: any } };
	modelSelection: ModelSelection | null;
	modelSelectionOptions: ModelSelectionOptions | undefined;
	overridesOfModel: OverridesOfModel | undefined;
	onAbort: OnAbort;
	workspaceFolder?: string; // active workspace folder path
	sessionId?: string; // agent session ID for this thread
	threadId?: string; // UI thread ID for routing callbacks
} & SendLLMType;

// params to the true sendLLMMessage function
export type SendLLMMessageParams = {
	onText: OnText;
	onDiff?: OnDiff;  // Real-time diffs from opencode
	onQuestion?: OnQuestion;
	onPermission?: OnPermission;
	onFinalMessage: OnFinalMessage;
	onError: OnError;
	logging: { loggingName: string, loggingExtras?: { [k: string]: any } };
	abortRef: AbortRef;

	modelSelection: ModelSelection;
	modelSelectionOptions: ModelSelectionOptions | undefined;
	overridesOfModel: OverridesOfModel | undefined;

	settingsOfProvider: SettingsOfProvider;
	mcpTools: InternalToolInfo[] | undefined;
	workspaceFolder?: string; // active workspace folder path
	authToken: string | null;
	isAuthenticated: boolean;
	sessionId?: string; // agent session ID for this thread
	threadId?: string; // UI thread ID for routing callbacks
} & SendLLMType



// can't send functions across a proxy, use listeners instead
export type BlockedMainLLMMessageParams = 'onText' | 'onFinalMessage' | 'onError' | 'onQuestion' | 'onPermission' | 'abortRef'
export type MainSendLLMMessageParams = Omit<SendLLMMessageParams, BlockedMainLLMMessageParams> & { requestId: string; threadId?: string } & SendLLMType

export type MainLLMMessageAbortParams = { requestId: string }

export type EventLLMMessageOnTextParams = Parameters<OnText>[0] & { requestId: string; threadId?: string }
export type EventLLMMessageOnFinalMessageParams = Parameters<OnFinalMessage>[0] & { requestId: string; threadId?: string }
export type EventLLMMessageOnErrorParams = Parameters<OnError>[0] & { requestId: string; threadId?: string }
export type EventLLMMessageOnQuestionParams = Parameters<OnQuestion>[0] & { requestId: string; threadId?: string }
export type EventLLMMessageOnPermissionParams = Parameters<OnPermission>[0] & { requestId: string; threadId?: string }

// service -> main -> internal -> event (back to main)
// (browser)









// These are from 'ollama' SDK
interface OllamaModelDetails {
	parent_model: string;
	format: string;
	family: string;
	families: string[];
	parameter_size: string;
	quantization_level: string;
}

export type OllamaModelResponse = {
	name: string;
	modified_at: Date;
	size: number;
	digest: string;
	details: OllamaModelDetails;
	expires_at: Date;
	size_vram: number;
}

export type OpenaiCompatibleModelResponse = {
	id: string;
	created: number;
	object: 'model';
	owned_by: string;
}



// params to the true list fn
export type ModelListParams<ModelResponse> = {
	providerName: ProviderName;
	settingsOfProvider: SettingsOfProvider;
	onSuccess: (param: { models: ModelResponse[] }) => void;
	onError: (param: { error: string }) => void;
}

// params to the service
export type ServiceModelListParams<modelResponse> = {
	providerName: RefreshableProviderName;
	onSuccess: (param: { models: modelResponse[] }) => void;
	onError: (param: { error: any }) => void;
}

type BlockedMainModelListParams = 'onSuccess' | 'onError'
export type MainModelListParams<modelResponse> = Omit<ModelListParams<modelResponse>, BlockedMainModelListParams> & { providerName: RefreshableProviderName, requestId: string }

export type EventModelListOnSuccessParams<modelResponse> = Parameters<ModelListParams<modelResponse>['onSuccess']>[0] & { requestId: string }
export type EventModelListOnErrorParams<modelResponse> = Parameters<ModelListParams<modelResponse>['onError']>[0] & { requestId: string }




