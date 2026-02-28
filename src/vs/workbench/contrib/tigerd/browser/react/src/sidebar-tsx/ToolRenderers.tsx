/*---------------------------------------------------------------------------------------------
 *  Tool Renderers - Modular system for rendering opencode tools in Tigerd
 *  Each tool has its own renderer component
 *  Subtle accent design - borders and icons, no full backgrounds
 *--------------------------------------------------------------------------------------------*/

import React, { useState } from 'react';
import { Terminal, FileText, FolderOpen, Search, HelpCircle, Edit3, X, FileCode, Folder, Command, CheckCircle2, Circle, Clock, AlertCircle, Globe, BookOpen } from 'lucide-react';
import { ToolState } from '../../../../common/sendLLMMessageTypes.js';
import { BlockCode, TigerdDiffEditor } from '../util/inputs.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { ICommandService } from '../../../../../../../platform/commands/common/commands.js';
import { IChatThreadService } from '../../../chatThreadService.js';

export interface ToolRendererProps {
	toolName: string;
	toolState: ToolState;
	toolId: string;
	rawParams: Record<string, any>;
	isDone: boolean;
	commandService?: ICommandService;
	onUserResponse?: (response: string) => void;
	threadId?: string;
	chatThreadsService?: IChatThreadService;
}

export type ToolRendererComponent = React.FC<ToolRendererProps>;

// =====================================================
// Base Tool Card - Using Void's ToolHeaderWrapper style with left ribbon
// =====================================================

const ACCENT_COLORS = {
	amber: {
		ribbon: 'bg-amber-500',
		border: 'border-l-amber-500',
		icon: 'text-amber-500',
	},
	teal: {
		ribbon: 'bg-teal-500',
		border: 'border-l-teal-500',
		icon: 'text-teal-500',
	},
	purple: {
		ribbon: 'bg-purple-500',
		border: 'border-l-purple-500',
		icon: 'text-purple-500',
	},
	blue: {
		ribbon: 'bg-blue-500',
		border: 'border-l-blue-500',
		icon: 'text-blue-500',
	},
	gray: {
		ribbon: 'bg-gray-500',
		border: 'border-l-gray-500',
		icon: 'text-gray-500',
	},
};

type AccentColor = keyof typeof ACCENT_COLORS;

// Chevron icon
const ChevronRight = ({ isOpen }: { isOpen: boolean }) => (
	<svg
		className={`w-4 h-4 flex-shrink-0 transition-transform duration-100 ${isOpen ? 'rotate-90' : ''}`}
		fill="none"
		stroke="currentColor"
		viewBox="0 0 24 24"
	>
		<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
	</svg>
);

// Loading spinner
const Spinner = () => (
	<div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
);

const ToolCard: React.FC<{
	accent: AccentColor;
	icon: React.ReactNode;
	title: string;
	subtitle?: string;
	subtitleOnClick?: () => void;
	children: React.ReactNode;
	isRunning?: boolean;
	isDone?: boolean;
	isError?: boolean;
	isExpanded?: boolean;
	onToggle?: () => void;
}> = ({ accent, icon, title, subtitle, subtitleOnClick, children, isRunning, isDone, isError, isExpanded = true, onToggle }) => {
	const colors = ACCENT_COLORS[accent];

	return (
		<div className="w-full border border-void-border-3 rounded overflow-hidden bg-void-bg-3 relative">
			{/* Left ribbon */}
			<div className={`absolute left-0 top-0 bottom-0 w-1 ${colors.ribbon}`} />
			{/* Header - with left padding for ribbon */}
			<div className="px-3 py-2 pl-4">
				<div
					className={`flex items-center gap-2 ${onToggle ? 'cursor-pointer hover:brightness-125' : ''}`}
					onClick={onToggle}
				>
					{onToggle && <ChevronRight isOpen={isExpanded} />}
					<span className={colors.icon}>{icon}</span>
					<span className="text-void-fg-2 text-base font-medium">{title}</span>
					{subtitle && (
						<code 
							className={`text-sm text-void-fg-3 truncate ${subtitleOnClick ? 'cursor-pointer hover:text-amber-400' : ''}`}
							onClick={(e) => { e.stopPropagation(); subtitleOnClick?.(); }}
						>
							{subtitle}
						</code>
					)}
					<span className="ml-auto flex items-center gap-2">
						{isRunning && <span className="text-sm text-amber-500 flex items-center gap-1"><Spinner /> Running...</span>}
						{isDone && !isError && <span className="text-sm text-teal-500">Done</span>}
						{isError && <span className="text-sm text-red-500">Error</span>}
					</span>
				</div>
			</div>

			{/* Content - collapsible */}
			{isExpanded && (
				<div className="border-t border-void-border-3 pl-3">
					{children}
				</div>
			)}
		</div>
	);
};

// =====================================================
// Tool Registry - Add new tools here
// =====================================================

const toolRenderers: Record<string, ToolRendererComponent> = {};

export function registerToolRenderer(toolName: string, renderer: ToolRendererComponent): void {
	toolRenderers[toolName] = renderer;
}

export function getToolRenderer(toolName: string): ToolRendererComponent | undefined {
	return toolRenderers[toolName];
}

// =====================================================
// Built-in Tool Renderers
// =====================================================

// --- Edit/File Tools ---

const EditFileRenderer: React.FC<ToolRendererProps> = ({ toolName, toolState, rawParams, isDone, commandService }) => {
	const [isExpanded, setIsExpanded] = useState(true);
	const isWrite = toolName === 'write' || toolName === 'rewrite_file';
	const isRunning = toolState?.status === 'running';

	// Get content from toolState.input first (more reliable), then rawParams fallback
	const inputParams = (toolState as any)?.input || rawParams || {};
	const uri = inputParams.uri || inputParams.filePath || inputParams.file_path || inputParams.path || rawParams?.uri || '';

	// Get the actual content to show
	let content = '';
	let diffContent = '';
	if (isWrite) {
		// Write tool - use content
		content = inputParams.content || inputParams.new_content || rawParams?.content || rawParams?.new_content || '';
	} else {
		// Edit tool - show oldString -> newString diff (Tigerd format)
		const oldString = inputParams.oldString || inputParams.old_string || '';
		const newString = inputParams.newString || inputParams.new_string || '';
		if (oldString || newString) {
			diffContent = `<<<<<<< ORIGINAL\n${oldString}\n=======\n${newString}\n>>>>>>> UPDATED`;
		}
	}

	// Get output (success message, errors, etc.) - check multiple sources
	const toolStateAny = toolState as any;
	const output = toolStateAny?.output || toolStateAny?.result || toolStateAny?.state?.output || '';
	const hasErrors = output.includes('Error') || output.includes('error') || output.includes('ERROR') || output.includes('diagnostics');

	// Create URI for file
	const fileUri = uri ? URI.file(uri) : undefined;

	// Handle click on subtitle to open file
	const handleSubtitleClick = () => {
		if (!uri || !commandService) {
			console.log('[ToolRenderers] Cannot open file - missing uri or commandService');
			return;
		}
		const fileUri = URI.file(uri);
		commandService.executeCommand('vscode.open', fileUri);
	};

	return (
		<ToolCard
			accent="amber"
			icon={<FileCode className="w-4 h-4" />}
			title={isWrite ? 'Writing file' : 'Editing file'}
			subtitle={uri}
			subtitleOnClick={handleSubtitleClick}
			isDone={isDone}
			isRunning={isRunning}
			isExpanded={isExpanded}
			onToggle={() => setIsExpanded(!isExpanded)}
		>
			{/* Show diff - for edit use TigerdDiffEditor with proper format */}
			{diffContent ? (
				<div className="max-h-96 overflow-auto">
					<TigerdDiffEditor
						uri={fileUri}
						searchReplaceBlocks={diffContent}
						language="typescript"
					/>
				</div>
			) : content ? (
				<div className="max-h-96 overflow-auto">
					<BlockCode
						initValue={content}
						language="typescript"
						maxHeight={384}
						showScrollbars
					/>
				</div>
			) : null}

			{/* Show output/errors below if any */}
			{output && (
				<div className={`px-3 py-2 border-t border-void-border-3 ${hasErrors ? 'bg-red-900/20' : ''}`}>
					<pre className={`text-xs font-mono whitespace-pre-wrap ${hasErrors ? 'text-red-400' : 'text-teal-400'}`}>
						{output}
					</pre>
				</div>
			)}

			{/* Show loading spinner only when actually running */}
			{isRunning && !content && !output && (
				<div className="px-3 py-3 text-center">
					<div className="inline-block w-3 h-3 border border-amber-500 border-t-transparent rounded-full animate-spin" />
				</div>
			)}
		</ToolCard>
	);
};

registerToolRenderer('edit_file', EditFileRenderer);
registerToolRenderer('rewrite_file', EditFileRenderer);
registerToolRenderer('apply_patch', EditFileRenderer);
registerToolRenderer('edit', EditFileRenderer);
registerToolRenderer('write', EditFileRenderer);
registerToolRenderer('multiedit', EditFileRenderer);

// --- Bash Tool ---

const BashRenderer: React.FC<ToolRendererProps> = ({ toolState, rawParams, isDone }) => {
	const [isExpanded, setIsExpanded] = useState(true);
	const isRunning = toolState?.status === 'running';
	const isError = toolState?.status === 'error';
	
	// Get from toolState.input first (more reliable), then rawParams
	const inputParams = (toolState as any)?.input || rawParams || {};
	const command = inputParams.command || rawParams?.command || '';
	const output = (toolState as any)?.output || '';
	const hasErrors = output.toLowerCase().includes('error') || output.toLowerCase().includes('failed');

	return (
		<ToolCard
			accent="teal"
			icon={<Terminal className="w-4 h-4" />}
			title={inputParams.description || rawParams?.description || 'Running command'}
			isRunning={isRunning}
			isDone={isDone}
			isError={isError}
			isExpanded={isExpanded}
			onToggle={() => setIsExpanded(!isExpanded)}
		>
			{/* Show command first */}
			{command && (
				<div className="px-3 py-2 border-b border-void-border-3">
					<code className="text-sm text-green-400 font-mono block">{command}</code>
				</div>
			)}
			{/* Show output/errors below */}
			{output && (
				<div className={`px-3 py-2 max-h-64 overflow-auto ${hasErrors ? 'bg-red-900/20' : ''}`}>
					<pre className={`text-xs font-mono whitespace-pre-wrap ${hasErrors ? 'text-red-400' : 'text-void-fg-3'}`}>
						{output}
					</pre>
				</div>
			)}
			{inputParams.workdir && (
				<div className="px-3 py-1 text-xs text-void-fg-4 border-t border-void-border-3">
					cwd: {inputParams.workdir}
				</div>
			)}
			{!command && !output && isRunning && (
				<div className="px-3 py-3 text-center">
					<div className="inline-block w-3 h-3 border border-teal-500 border-t-transparent rounded-full animate-spin" />
				</div>
			)}
		</ToolCard>
	);
};

registerToolRenderer('bash', BashRenderer);

// --- Read Tool ---

const ReadRenderer: React.FC<ToolRendererProps> = ({ toolState, rawParams, isDone }) => {
	const [isExpanded, setIsExpanded] = useState(true);
	const toolStateAny = toolState as any;
	const output = toolStateAny?.output || toolStateAny?.result || '';
	const inputParams = toolStateAny?.input || rawParams || {};
	const filePath = inputParams.filePath || inputParams.path || rawParams?.filePath || rawParams?.path || '';
	const isRunning = toolState?.status === 'running';

	// Clean up output - remove path wrappers if present
	const cleanOutput = output.replace(/^<path>.*?<\/path>\n*<type>.*?<\/type>\n*/s, '').replace(/^<content>\n?/, '').replace(/\n?<\/content>$/, '');

	return (
		<ToolCard
			accent="teal"
			icon={<FileText className="w-4 h-4" />}
			title="Reading file"
			subtitle={filePath}
			isDone={isDone}
			isRunning={isRunning}
			isExpanded={isExpanded}
			onToggle={() => setIsExpanded(!isExpanded)}
		>
			{cleanOutput && (
				<div className="max-h-80 overflow-auto">
					<BlockCode initValue={cleanOutput} language="typescript" maxHeight={320} showScrollbars />
				</div>
			)}
			{!cleanOutput && isRunning && (
				<div className="px-3 py-3 text-center">
					<div className="inline-block w-3 h-3 border border-teal-500 border-t-transparent rounded-full animate-spin" />
				</div>
			)}
		</ToolCard>
	);
};

registerToolRenderer('read', ReadRenderer);

// --- Todo Tool ---

interface TodoItem {
	content: string;
	id: string;
	priority?: string;
	status?: string;
}

const TodoRenderer: React.FC<ToolRendererProps> = ({ toolState, rawParams, isDone }) => {
	const [isExpanded, setIsExpanded] = useState(true);
	const isRunning = toolState?.status === 'running';

	// Parse todo items from rawParams or output
	const todoItems: TodoItem[] = rawParams.todos || [];
	const output = (toolState as any)?.output || '';

	// Try to parse from output if not in rawParams
	let parsedTodos: TodoItem[] = todoItems;
	if (!parsedTodos.length && output) {
		try {
			parsedTodos = JSON.parse(output);
		} catch {
			parsedTodos = [];
		}
	}

	const getStatusIcon = (status?: string) => {
		switch (status) {
			case 'completed':
				return <CheckCircle2 className="w-4 h-4 text-teal-500" />;
			case 'in_progress':
				return <Clock className="w-4 h-4 text-amber-500" />;
			case 'pending':
				return <Circle className="w-4 h-4 text-void-fg-4" />;
			default:
				return <Circle className="w-4 h-4 text-void-fg-4" />;
		}
	};

	const getPriorityColor = (priority?: string) => {
		switch (priority) {
			case 'high':
				return 'text-red-400';
			case 'medium':
				return 'text-amber-400';
			case 'low':
				return 'text-void-fg-4';
			default:
				return 'text-void-fg-4';
		}
	};

	return (
		<ToolCard
			accent="purple"
			icon={<Command className="w-4 h-4" />}
			title="Task List"
			subtitle={`${parsedTodos.length} items`}
			isDone={isDone}
			isRunning={isRunning}
			isExpanded={isExpanded}
			onToggle={() => setIsExpanded(!isExpanded)}
		>
			{parsedTodos.length > 0 ? (
				<div className="px-3 py-2 divide-y divide-void-border-3">
					{parsedTodos.map((item, idx) => (
						<div key={item.id || idx} className="py-2 first:pt-0 last:pb-0 flex items-start gap-3">
							<div className="mt-0.5">{getStatusIcon(item.status)}</div>
							<div className="flex-1 min-w-0">
								<p className="text-sm text-void-fg-3">{item.content}</p>
								{item.priority && (
									<span className={`text-xs ${getPriorityColor(item.priority)}`}>
										{item.priority}
									</span>
								)}
							</div>
						</div>
					))}
				</div>
			) : (
				<div className="px-3 py-2 text-sm text-void-fg-4">
					No tasks
				</div>
			)}
		</ToolCard>
	);
};

registerToolRenderer('todoread', TodoRenderer);
registerToolRenderer('todowrite', TodoRenderer);

// --- Question Tool ---

const QuestionRenderer: React.FC<ToolRendererProps> = ({ toolState, rawParams, threadId, chatThreadsService }) => {
	const inputParams = (toolState as any)?.input || rawParams || {};
	const questions = Array.isArray(inputParams.questions) ? inputParams.questions : Array.isArray(rawParams?.questions) ? rawParams.questions : [];
	const [answers, setAnswers] = React.useState<Record<number, string>>({});
	const [submitted, setSubmitted] = React.useState(false);
	const [isSubmitting, setIsSubmitting] = React.useState(false);

	const handleSubmit = async () => {
		if (submitted || isSubmitting || !threadId || !chatThreadsService) return;
		
		setIsSubmitting(true);
		
		try {
			// Format answers as { questionID, answer } array
			const answerArray = Object.entries(answers).map(([qIdx, answer]) => ({
				questionID: questions[parseInt(qIdx)]?.id || `q${qIdx}`,
				answer: answer,
			}));
			
			// Use the question reply API instead of sending a new message
			const success = await (chatThreadsService as any).replyToQuestion(threadId, answerArray);
			if (success) {
				setSubmitted(true);
			} else {
				console.error('[QuestionRenderer] Failed to submit answer');
			}
		} catch (error) {
			console.error('[QuestionRenderer] Error submitting answer:', error);
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleCancel = async () => {
		if (!threadId || !chatThreadsService || submitted) return;
		// Use the question reject API
		try {
			await (chatThreadsService as any).rejectQuestion(threadId);
		} catch (error) {
			console.error('[QuestionRenderer] Error rejecting question:', error);
		}
	};

	const handleOptionSelect = (qIdx: number, option: string) => {
		setAnswers(prev => ({ ...prev, [qIdx]: option }));
	};

	const handleTextChange = (qIdx: number, value: string) => {
		setAnswers(prev => ({ ...prev, [qIdx]: value }));
	};

	return (
		<ToolCard
			accent="blue"
			icon={<HelpCircle className="w-4 h-4" />}
			title="Question"
		>
			<div className="px-4 py-3">
				{questions.map((q: any, idx: number) => (
					<div key={idx} className="mb-4 last:mb-0">
						<p className="text-base text-void-fg-2 mb-3 font-medium">{q.question}</p>
						{q.options && q.options.length > 0 && (
							<div className="flex gap-2 flex-wrap">
								{q.options.map((opt: any, i: number) => {
									const optLabel = typeof opt === 'string' ? opt : opt.label || opt;
									const isSelected = answers[idx] === optLabel;
									return (
										<button
											key={i}
											disabled={submitted}
											onClick={() => handleOptionSelect(idx, optLabel)}
											className={`px-4 py-2 text-sm font-medium rounded transition-all ${
												isSelected 
													? 'bg-amber-500 text-white' 
													: 'bg-amber-600/50 text-white hover:bg-amber-500'
											} ${submitted ? 'opacity-50 cursor-not-allowed' : ''}`}
										>
											{optLabel}
										</button>
									);
								})}
							</div>
						)}
						{!q.options && (
							<input
								type="text"
								disabled={submitted}
								value={answers[idx] || ''}
								onChange={(e) => handleTextChange(idx, e.target.value)}
								placeholder="Type your answer..."
								className="w-full px-3 py-2 bg-void-bg-2 border border-void-border-3 rounded text-void-fg-2 text-sm placeholder:text-void-fg-4 focus:outline-none focus:border-amber-500"
							/>
						)}
					</div>
				))}
				{questions.length === 0 && (
					<div className="text-sm text-void-fg-4">
						No questions
					</div>
				)}
				{questions.length > 0 && !submitted && (
					<div className="flex gap-2 mt-3">
						<button
							onClick={handleSubmit}
							disabled={isSubmitting}
							className="flex-1 px-4 py-2 bg-teal-600 hover:bg-teal-500 disabled:bg-teal-800 text-white font-medium rounded transition-colors disabled:cursor-not-allowed"
						>
							{isSubmitting ? 'Submitting...' : 'Submit'}
						</button>
						<button
							onClick={handleCancel}
							className="px-4 py-2 bg-red-600/50 hover:bg-red-600 text-white font-medium rounded transition-colors"
						>
							Cancel
						</button>
					</div>
				)}
				{submitted && (
					<div className="mt-3 text-sm text-teal-500 text-center">
						Answer submitted!
					</div>
				)}
			</div>
		</ToolCard>
	);
};

registerToolRenderer('question', QuestionRenderer);

// --- Permission Tool ---

const PermissionRenderer: React.FC<ToolRendererProps> = ({ toolState, rawParams, threadId, chatThreadsService }) => {
	const inputParams = (toolState as any)?.input || rawParams || {};
	const permission = inputParams.permission || rawParams?.permission || {};
	const [response, setResponse] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const handleResponse = async (reply: 'once' | 'always' | 'reject') => {
		if (!threadId || !chatThreadsService || response) return;
		
		setIsSubmitting(true);
		try {
			const success = await (chatThreadsService as any).respondToPermission(threadId, reply);
			if (success) {
				setResponse(reply);
			} else {
				console.error('[PermissionRenderer] Failed to respond to permission');
			}
		} catch (error) {
			console.error('[PermissionRenderer] Error responding to permission:', error);
		} finally {
			setIsSubmitting(false);
		}
	};

	const permissionType = permission.type || 'unknown';
	const permissionDescription = permission.description || 'The agent is requesting permission to perform an action.';
	const permissionCluster = permission.cluster || '';

	return (
		<ToolCard
			accent="amber"
			icon={<AlertCircle className="w-4 h-4" />}
			title="Permission Request"
			subtitle={permissionType}
		>
			<div className="px-4 py-3">
				{permissionCluster && (
					<p className="text-sm text-amber-400 mb-2 font-medium">
						{permissionCluster}
					</p>
				)}
				<p className="text-base text-void-fg-2 mb-4">
					{permissionDescription}
				</p>
				
				{response ? (
					<div className="text-sm text-teal-500 text-center">
						Permission {response === 'reject' ? 'denied' : 'granted'}!
					</div>
				) : (
					<div className="flex gap-2 mt-3">
						<button
							onClick={() => handleResponse('once')}
							disabled={isSubmitting}
							className="flex-1 px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-amber-800 text-white font-medium rounded transition-colors disabled:cursor-not-allowed"
						>
							{isSubmitting ? 'Allowing...' : 'Allow Once'}
						</button>
						<button
							onClick={() => handleResponse('always')}
							disabled={isSubmitting}
							className="flex-1 px-4 py-2 bg-teal-600 hover:bg-teal-500 disabled:bg-teal-800 text-white font-medium rounded transition-colors disabled:cursor-not-allowed"
						>
							{isSubmitting ? 'Allowing...' : 'Always Allow'}
						</button>
						<button
							onClick={() => handleResponse('reject')}
							disabled={isSubmitting}
							className="px-4 py-2 bg-red-600/50 hover:bg-red-600 text-white font-medium rounded transition-colors disabled:cursor-not-allowed"
						>
							Deny
						</button>
					</div>
				)}
			</div>
		</ToolCard>
	);
};

registerToolRenderer('permission', PermissionRenderer);

// --- Grep/Search Tool ---

const GrepRenderer: React.FC<ToolRendererProps> = ({ toolState, rawParams, isDone }) => {
	const inputParams = (toolState as any)?.input || rawParams || {};
	const output = (toolState as any)?.output || '';
	const pattern = inputParams.pattern || rawParams?.pattern || '';
	const searchPath = inputParams.path || inputParams.filePath || rawParams?.path || '';

	return (
		<ToolCard
			accent="purple"
			icon={<Search className="w-4 h-4" />}
			title="Search"
			subtitle={pattern}
			isDone={isDone}
		>
			{searchPath && (
				<div className="px-3 py-1 text-xs text-void-fg-4 border-b border-void-border-3">
					in {searchPath}
				</div>
			)}
			{output && (
				<div className="px-3 py-2 max-h-64 overflow-auto">
					<pre className="text-xs text-void-fg-3 font-mono whitespace-pre-wrap">
						{output}
					</pre>
				</div>
			)}
		</ToolCard>
	);
};

registerToolRenderer('grep', GrepRenderer);
registerToolRenderer('glob', GrepRenderer);

// --- Web Search Tool ---

const WebSearchRenderer: React.FC<ToolRendererProps> = ({ toolState, rawParams, isDone }) => {
	const inputParams = (toolState as any)?.input || rawParams || {};
	const query = inputParams.query || rawParams?.query || '';
	const isRunning = toolState?.status === 'running';

	return (
		<ToolCard
			accent="blue"
			icon={<Globe className="w-4 h-4" />}
			title="Web Search"
			subtitle={query}
			isDone={isDone}
			isRunning={isRunning}
		>
			{null}
		</ToolCard>
	);
};

registerToolRenderer('websearch', WebSearchRenderer);
registerToolRenderer('web_search', WebSearchRenderer);

// --- Code Search Tool ---

const CodeSearchRenderer: React.FC<ToolRendererProps> = ({ toolState, rawParams, isDone }) => {
	const inputParams = (toolState as any)?.input || rawParams || {};
	const query = inputParams.query || rawParams?.query || '';
	const isRunning = toolState?.status === 'running';

	return (
		<ToolCard
			accent="purple"
			icon={<BookOpen className="w-4 h-4" />}
			title="Code Search"
			subtitle={query}
			isDone={isDone}
			isRunning={isRunning}
		>
			{null}
		</ToolCard>
	);
};

registerToolRenderer('codesearch', CodeSearchRenderer);
registerToolRenderer('code_search', CodeSearchRenderer);

// --- List Tool (ls) ---

const ListRenderer: React.FC<ToolRendererProps> = ({ toolState, rawParams, isDone }) => {
	const output = (toolState as any)?.output || '';
	const path = rawParams.path || '';

	return (
		<ToolCard
			accent="teal"
			icon={<FolderOpen className="w-4 h-4" />}
			title="List directory"
			subtitle={path || '.'}
			isDone={isDone}
		>
			{output && (
				<div className="px-3 py-2 max-h-48 overflow-auto bg-[var(--surface-app)] dark:bg-[#0a0a0a]">
					<pre className="text-xs text-[var(--fg-app)] font-mono whitespace-pre-wrap opacity-80">
						{output}
					</pre>
				</div>
			)}
		</ToolCard>
	);
};

registerToolRenderer('list', ListRenderer);
registerToolRenderer('ls', ListRenderer);

// --- Default/Fallback Renderer ---

const DefaultRenderer: React.FC<ToolRendererProps> = ({ toolName, toolState, isDone }) => {
	const isRunning = toolState?.status === 'running';
	const output = (toolState as any)?.output || '';

	return (
		<ToolCard
			accent="gray"
			icon={<X className="w-4 h-4" />}
			title={toolName}
			isRunning={isRunning}
			isDone={isDone}
		>
			{output && (
				<div className="px-3 py-2 max-h-48 overflow-auto">
					<pre className="text-xs text-[var(--fg-app)] font-mono whitespace-pre-wrap opacity-80">
						{output}
					</pre>
				</div>
			)}
		</ToolCard>
	);
};

registerToolRenderer('__default__', DefaultRenderer);

// =====================================================
// Main Tool Renderer Component
// =====================================================

export const ToolRenderer: React.FC<ToolRendererProps> = (props) => {
	const renderer = getToolRenderer(props.toolName);
	if (renderer) {
		return renderer(props);
	}
	return <DefaultRenderer {...props} />;
};

export default ToolRenderer;
