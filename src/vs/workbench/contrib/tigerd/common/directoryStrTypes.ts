import { URI } from '../../../../base/common/uri.js';

export type TigerdDirectoryItem = {
	uri: URI;
	name: string;
	isSymbolicLink: boolean;
	children: TigerdDirectoryItem[] | null;
	isDirectory: boolean;
	isGitIgnoredDirectory: false | { numChildren: number }; // if directory is gitignored, we ignore children
}
