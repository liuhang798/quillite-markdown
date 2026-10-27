export namespace main {

	export class AIDiagnosticCheck {
	    code: string;
	    status: string;
	    message: string;
	    durationMs?: number;

	    static createFrom(source: any = {}) {
	        return new AIDiagnosticCheck(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.code = source["code"];
	        this.status = source["status"];
	        this.message = source["message"];
	        this.durationMs = source["durationMs"];
	    }
	}
	export class AIDiagnosticResult {
	    success: boolean;
	    checks: AIDiagnosticCheck[];
	    models?: string[];

	    static createFrom(source: any = {}) {
	        return new AIDiagnosticResult(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.success = source["success"];
	        this.checks = this.convertValues(source["checks"], AIDiagnosticCheck);
	        this.models = source["models"];
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class AIDocumentReviewRequest {
	    text: string;
	    instruction: string;
	    requestId?: string;

	    static createFrom(source: any = {}) {
	        return new AIDocumentReviewRequest(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.text = source["text"];
	        this.instruction = source["instruction"];
	        this.requestId = source["requestId"];
	    }
	}
	export class AIDocumentSuggestion {
	    id: string;
	    category: string;
	    severity: string;
	    original: string;
	    replacement: string;
	    reason: string;
	    occurrence: number;

	    static createFrom(source: any = {}) {
	        return new AIDocumentSuggestion(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.category = source["category"];
	        this.severity = source["severity"];
	        this.original = source["original"];
	        this.replacement = source["replacement"];
	        this.reason = source["reason"];
	        this.occurrence = source["occurrence"];
	    }
	}
	export class AIDocumentReviewResponse {
	    suggestions: AIDocumentSuggestion[];

	    static createFrom(source: any = {}) {
	        return new AIDocumentReviewResponse(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.suggestions = this.convertValues(source["suggestions"], AIDocumentSuggestion);
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

	export class AIModelDiscoveryInput {
	    provider: string;
	    baseUrl: string;
	    apiKey: string;

	    static createFrom(source: any = {}) {
	        return new AIModelDiscoveryInput(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.provider = source["provider"];
	        this.baseUrl = source["baseUrl"];
	        this.apiKey = source["apiKey"];
	    }
	}
	export class AIRewriteRequest {
	    action: string;
	    text: string;
	    instruction: string;
	    targetLanguage: string;
	    requestId?: string;

	    static createFrom(source: any = {}) {
	        return new AIRewriteRequest(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.action = source["action"];
	        this.text = source["text"];
	        this.instruction = source["instruction"];
	        this.targetLanguage = source["targetLanguage"];
	        this.requestId = source["requestId"];
	    }
	}
	export class AIRewriteResponse {
	    text: string;

	    static createFrom(source: any = {}) {
	        return new AIRewriteResponse(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.text = source["text"];
	    }
	}
	export class AISettings {
	    provider: string;
	    baseUrl: string;
	    model: string;
	    hasApiKey: boolean;
	    maskedApiKey?: string;
	    isDefault: boolean;

	    static createFrom(source: any = {}) {
	        return new AISettings(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.provider = source["provider"];
	        this.baseUrl = source["baseUrl"];
	        this.model = source["model"];
	        this.hasApiKey = source["hasApiKey"];
	        this.maskedApiKey = source["maskedApiKey"];
	        this.isDefault = source["isDefault"];
	    }
	}
	export class AISettingsInput {
	    provider: string;
	    baseUrl: string;
	    model: string;
	    apiKey: string;
	    clearApiKey: boolean;

	    static createFrom(source: any = {}) {
	        return new AISettingsInput(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.provider = source["provider"];
	        this.baseUrl = source["baseUrl"];
	        this.model = source["model"];
	        this.apiKey = source["apiKey"];
	        this.clearApiKey = source["clearApiKey"];
	    }
	}
	export class BodyTypography {
	    chineseFont: string;
	    englishFont: string;
	    formulaSize: string;
	    lineSpacing: string;

	    static createFrom(source: any = {}) {
	        return new BodyTypography(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.chineseFont = source["chineseFont"];
	        this.englishFont = source["englishFont"];
	        this.formulaSize = source["formulaSize"];
	        this.lineSpacing = source["lineSpacing"];
	    }
	}
	export class DiagnosticFlags {
	    documentOpen: boolean;
	    unsaved: boolean;
	    conflict: boolean;
	    saving: boolean;

	    static createFrom(source: any = {}) {
	        return new DiagnosticFlags(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.documentOpen = source["documentOpen"];
	        this.unsaved = source["unsaved"];
	        this.conflict = source["conflict"];
	        this.saving = source["saving"];
	    }
	}
	export class DiagnosticInput {
	    checks: DiagnosticFlags;
	    errors: Record<string, number>;

	    static createFrom(source: any = {}) {
	        return new DiagnosticInput(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.checks = this.convertValues(source["checks"], DiagnosticFlags);
	        this.errors = source["errors"];
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Document {
	    path: string;
	    name: string;
	    directory: string;
	    content: string;
	    modifiedAt: string;
	    size: number;
	    replacedPath?: string;
	    readOnly?: boolean;
	    revision?: string;
	    draft?: boolean;
	    warning?: string;

	    static createFrom(source: any = {}) {
	        return new Document(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.name = source["name"];
	        this.directory = source["directory"];
	        this.content = source["content"];
	        this.modifiedAt = source["modifiedAt"];
	        this.size = source["size"];
	        this.replacedPath = source["replacedPath"];
	        this.readOnly = source["readOnly"];
	        this.revision = source["revision"];
	        this.draft = source["draft"];
	        this.warning = source["warning"];
	    }
	}
	export class DocumentVersion {
	    id: string;
	    path: string;
	    createdAt: string;
	    size: number;

	    static createFrom(source: any = {}) {
	        return new DocumentVersion(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.path = source["path"];
	        this.createdAt = source["createdAt"];
	        this.size = source["size"];
	    }
	}
	export class DocumentVersionDetail {
	    id: string;
	    path: string;
	    createdAt: string;
	    size: number;
	    content: string;

	    static createFrom(source: any = {}) {
	        return new DocumentVersionDetail(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.path = source["path"];
	        this.createdAt = source["createdAt"];
	        this.size = source["size"];
	        this.content = source["content"];
	    }
	}
	export class ExportPreset {
	    id: string;
	    name: string;
	    format: string;
	    header?: string;
	    footer?: string;
	    extraArguments?: string;
	    customWriter?: string;
	    customExtension?: string;
	    imageScale?: number;
	    imageLayout?: string;

	    static createFrom(source: any = {}) {
	        return new ExportPreset(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.format = source["format"];
	        this.header = source["header"];
	        this.footer = source["footer"];
	        this.extraArguments = source["extraArguments"];
	        this.customWriter = source["customWriter"];
	        this.customExtension = source["customExtension"];
	        this.imageScale = source["imageScale"];
	        this.imageLayout = source["imageLayout"];
	    }
	}
	export class ExportSettings {
	    pandocPath?: string;
	    presets?: ExportPreset[];

	    static createFrom(source: any = {}) {
	        return new ExportSettings(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.pandocPath = source["pandocPath"];
	        this.presets = this.convertValues(source["presets"], ExportPreset);
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class FeedbackImageSelection {
	    path: string;
	    name: string;
	    size: number;

	    static createFrom(source: any = {}) {
	        return new FeedbackImageSelection(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.name = source["name"];
	        this.size = source["size"];
	    }
	}
	export class FeedbackSubmission {
	    category: string;
	    message: string;
	    email: string;
	    phone: string;
	    imagePaths: string[];

	    static createFrom(source: any = {}) {
	        return new FeedbackSubmission(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.category = source["category"];
	        this.message = source["message"];
	        this.email = source["email"];
	        this.phone = source["phone"];
	        this.imagePaths = source["imagePaths"];
	    }
	}
	export class FeedbackSystemInfo {
	    appVersion: string;
	    os: string;
	    systemVersion: string;

	    static createFrom(source: any = {}) {
	        return new FeedbackSystemInfo(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.appVersion = source["appVersion"];
	        this.os = source["os"];
	        this.systemVersion = source["systemVersion"];
	    }
	}
	export class FolderFile {
	    path: string;
	    name: string;
	    relativePath: string;
	    directory: string;

	    static createFrom(source: any = {}) {
	        return new FolderFile(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.name = source["name"];
	        this.relativePath = source["relativePath"];
	        this.directory = source["directory"];
	    }
	}
	export class FolderResult {
	    root: string;
	    name: string;
	    files: FolderFile[];

	    static createFrom(source: any = {}) {
	        return new FolderResult(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.root = source["root"];
	        this.name = source["name"];
	        this.files = this.convertValues(source["files"], FolderFile);
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class PicGoCLIDraft {
	    cliPath: string;
	    cliConfigPath: string;
	    cliAllowHttp: boolean;

	    static createFrom(source: any = {}) {
	        return new PicGoCLIDraft(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.cliPath = source["cliPath"];
	        this.cliConfigPath = source["cliConfigPath"];
	        this.cliAllowHttp = source["cliAllowHttp"];
	    }
	}
	export class ImageUploadSettings {
	    cliDraft?: PicGoCLIDraft;
	    cliLoginConfigPath: string;
	    cliAllowHttp: boolean;
	    cliConfigPath: string;
	    cliPath: string;
	    mode: string;
	    serverUrl: string;
	    hasSecret: boolean;
	    hasCloudToken: boolean;

	    static createFrom(source: any = {}) {
	        return new ImageUploadSettings(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.cliDraft = this.convertValues(source["cliDraft"], PicGoCLIDraft);
	        this.cliLoginConfigPath = source["cliLoginConfigPath"];
	        this.cliAllowHttp = source["cliAllowHttp"];
	        this.cliConfigPath = source["cliConfigPath"];
	        this.cliPath = source["cliPath"];
	        this.mode = source["mode"];
	        this.serverUrl = source["serverUrl"];
	        this.hasSecret = source["hasSecret"];
	        this.hasCloudToken = source["hasCloudToken"];
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ImageUploadSettingsInput {
	    cliAllowHttp: boolean;
	    cliConfigPath: string;
	    cliPath: string;
	    mode: string;
	    serverUrl: string;
	    secret: string;
	    clearSecret: boolean;

	    static createFrom(source: any = {}) {
	        return new ImageUploadSettingsInput(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.cliAllowHttp = source["cliAllowHttp"];
	        this.cliConfigPath = source["cliConfigPath"];
	        this.cliPath = source["cliPath"];
	        this.mode = source["mode"];
	        this.serverUrl = source["serverUrl"];
	        this.secret = source["secret"];
	        this.clearSecret = source["clearSecret"];
	    }
	}
	export class PandocExportInput {
	    sourcePath: string;
	    title: string;
	    content: string;
	    format: string;
	    pandocPath?: string;
	    header?: string;
	    footer?: string;
	    extraArguments?: string;
	    customWriter?: string;
	    customExtension?: string;

	    static createFrom(source: any = {}) {
	        return new PandocExportInput(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.sourcePath = source["sourcePath"];
	        this.title = source["title"];
	        this.content = source["content"];
	        this.format = source["format"];
	        this.pandocPath = source["pandocPath"];
	        this.header = source["header"];
	        this.footer = source["footer"];
	        this.extraArguments = source["extraArguments"];
	        this.customWriter = source["customWriter"];
	        this.customExtension = source["customExtension"];
	    }
	}
	export class PandocStatus {
	    available: boolean;
	    path?: string;
	    version?: string;

	    static createFrom(source: any = {}) {
	        return new PandocStatus(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.available = source["available"];
	        this.path = source["path"];
	        this.version = source["version"];
	    }
	}

	export class PicGoCloudStatus {
	    connected: boolean;
	    user?: string;
	    plan?: number;

	    static createFrom(source: any = {}) {
	        return new PicGoCloudStatus(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.connected = source["connected"];
	        this.user = source["user"];
	        this.plan = source["plan"];
	    }
	}
	export class RecentFileStatus {
	    path: string;
	    exists: boolean;

	    static createFrom(source: any = {}) {
	        return new RecentFileStatus(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.exists = source["exists"];
	    }
	}
	export class Preferences {
	    recentFiles: string[];
	    recentFileStatuses?: RecentFileStatus[];
	    pinnedRecentFiles: string[];
	    favoriteFiles: string[];
	    favoriteFileStatuses?: RecentFileStatus[];
	    draftFiles?: string[];
	    lastFile?: string;
	    lastSaveDirectory?: string;
	    explorerRoot?: string;
	    language: string;
	    fontFamily?: string;
	    bodyTypography: BodyTypography;
	    lastUpdateCheck?: string;
	    suppressUpdateUntil?: string;
	    usageAnalytics: boolean;
	    imageUploadMode?: string;
	    picGoServerUrl?: string;
	    picGoCliPath?: string;
	    picGoCliConfigPath?: string;
	    picGoCliAllowHttp?: boolean;
	    picGoManagedCliPath?: string;
	    picGoCliLoginConfigPath?: string;
	    picGoCliDraft?: PicGoCLIDraft;
	    aiProvider?: string;
	    aiBaseUrl?: string;
	    aiBaseUrls?: Record<string, string>;
	    aiModel?: string;
	    aiModels?: Record<string, string>;
	    anonymousInstallId?: string;
	    lastActiveReport?: string;
	    exportSettings?: ExportSettings;

	    static createFrom(source: any = {}) {
	        return new Preferences(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.recentFiles = source["recentFiles"];
	        this.recentFileStatuses = this.convertValues(source["recentFileStatuses"], RecentFileStatus);
	        this.pinnedRecentFiles = source["pinnedRecentFiles"];
	        this.favoriteFiles = source["favoriteFiles"];
	        this.favoriteFileStatuses = this.convertValues(source["favoriteFileStatuses"], RecentFileStatus);
	        this.draftFiles = source["draftFiles"];
	        this.lastFile = source["lastFile"];
	        this.lastSaveDirectory = source["lastSaveDirectory"];
	        this.explorerRoot = source["explorerRoot"];
	        this.language = source["language"];
	        this.fontFamily = source["fontFamily"];
	        this.bodyTypography = this.convertValues(source["bodyTypography"], BodyTypography);
	        this.lastUpdateCheck = source["lastUpdateCheck"];
	        this.suppressUpdateUntil = source["suppressUpdateUntil"];
	        this.usageAnalytics = source["usageAnalytics"];
	        this.imageUploadMode = source["imageUploadMode"];
	        this.picGoServerUrl = source["picGoServerUrl"];
	        this.picGoCliPath = source["picGoCliPath"];
	        this.picGoCliConfigPath = source["picGoCliConfigPath"];
	        this.picGoCliAllowHttp = source["picGoCliAllowHttp"];
	        this.picGoManagedCliPath = source["picGoManagedCliPath"];
	        this.picGoCliLoginConfigPath = source["picGoCliLoginConfigPath"];
	        this.picGoCliDraft = this.convertValues(source["picGoCliDraft"], PicGoCLIDraft);
	        this.aiProvider = source["aiProvider"];
	        this.aiBaseUrl = source["aiBaseUrl"];
	        this.aiBaseUrls = source["aiBaseUrls"];
	        this.aiModel = source["aiModel"];
	        this.aiModels = source["aiModels"];
	        this.anonymousInstallId = source["anonymousInstallId"];
	        this.lastActiveReport = source["lastActiveReport"];
	        this.exportSettings = this.convertValues(source["exportSettings"], ExportSettings);
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

	export class RecoveryArchive {
	    id: string;
	    name: string;
	    updatedAt: string;
	    size: number;

	    static createFrom(source: any = {}) {
	        return new RecoveryArchive(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.updatedAt = source["updatedAt"];
	        this.size = source["size"];
	    }
	}
	export class RecoverySnapshot {
	    baseRevision?: string;
	    conflict?: boolean;
	    path: string;
	    name: string;
	    directory: string;
	    content: string;
	    updatedAt: string;

	    static createFrom(source: any = {}) {
	        return new RecoverySnapshot(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.baseRevision = source["baseRevision"];
	        this.conflict = source["conflict"];
	        this.path = source["path"];
	        this.name = source["name"];
	        this.directory = source["directory"];
	        this.content = source["content"];
	        this.updatedAt = source["updatedAt"];
	    }
	}
	export class RecoverySnapshotInput {
	    baseRevision?: string;
	    conflict?: boolean;
	    path: string;
	    name: string;
	    directory: string;
	    content: string;

	    static createFrom(source: any = {}) {
	        return new RecoverySnapshotInput(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.baseRevision = source["baseRevision"];
	        this.conflict = source["conflict"];
	        this.path = source["path"];
	        this.name = source["name"];
	        this.directory = source["directory"];
	        this.content = source["content"];
	    }
	}
	export class UpdateInfo {
	    checked: boolean;
	    suppressed: boolean;
	    available: boolean;
	    manualInstallRequired: boolean;
	    manualInstallReason: string;
	    manualInstallerUrl: string;
	    currentVersion: string;
	    latestVersion: string;
	    releaseName: string;
	    releaseNotes: string;
	    releaseUrl: string;
	    publishedAt: string;

	    static createFrom(source: any = {}) {
	        return new UpdateInfo(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.checked = source["checked"];
	        this.suppressed = source["suppressed"];
	        this.available = source["available"];
	        this.manualInstallRequired = source["manualInstallRequired"];
	        this.manualInstallReason = source["manualInstallReason"];
	        this.manualInstallerUrl = source["manualInstallerUrl"];
	        this.currentVersion = source["currentVersion"];
	        this.latestVersion = source["latestVersion"];
	        this.releaseName = source["releaseName"];
	        this.releaseNotes = source["releaseNotes"];
	        this.releaseUrl = source["releaseUrl"];
	        this.publishedAt = source["publishedAt"];
	    }
	}
	export class WindowsInstallSafety {
	    applicable: boolean;
	    safe: boolean;
	    currentVersion: string;
	    downloadUrl: string;

	    static createFrom(source: any = {}) {
	        return new WindowsInstallSafety(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.applicable = source["applicable"];
	        this.safe = source["safe"];
	        this.currentVersion = source["currentVersion"];
	        this.downloadUrl = source["downloadUrl"];
	    }
	}
	export class WorkspaceApplyResult {
	    path: string;
	    status: string;

	    static createFrom(source: any = {}) {
	        return new WorkspaceApplyResult(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.status = source["status"];
	    }
	}
	export class WorkspaceChange {
	    path: string;
	    relativePath: string;
	    before: string;
	    after: string;
	    revision: string;
	    count: number;

	    static createFrom(source: any = {}) {
	        return new WorkspaceChange(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.relativePath = source["relativePath"];
	        this.before = source["before"];
	        this.after = source["after"];
	        this.revision = source["revision"];
	        this.count = source["count"];
	    }
	}
	export class WorkspaceMatch {
	    path: string;
	    relativePath: string;
	    line: number;
	    text: string;

	    static createFrom(source: any = {}) {
	        return new WorkspaceMatch(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.relativePath = source["relativePath"];
	        this.line = source["line"];
	        this.text = source["text"];
	    }
	}
	export class WorkspacePreview {
	    token: string;
	    changes: WorkspaceChange[];
	    skipped: number;
	    limited: boolean;

	    static createFrom(source: any = {}) {
	        return new WorkspacePreview(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.token = source["token"];
	        this.changes = this.convertValues(source["changes"], WorkspaceChange);
	        this.skipped = source["skipped"];
	        this.limited = source["limited"];
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class WorkspaceQuery {
	    root: string;
	    query: string;
	    filter: string;
	    extension: string;
	    replacement: string;
	    excludePath: string;

	    static createFrom(source: any = {}) {
	        return new WorkspaceQuery(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.root = source["root"];
	        this.query = source["query"];
	        this.filter = source["filter"];
	        this.extension = source["extension"];
	        this.replacement = source["replacement"];
	        this.excludePath = source["excludePath"];
	    }
	}
	export class WorkspaceSearchResult {
	    matches: WorkspaceMatch[];
	    scanned: number;
	    skipped: number;
	    limited: boolean;

	    static createFrom(source: any = {}) {
	        return new WorkspaceSearchResult(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.matches = this.convertValues(source["matches"], WorkspaceMatch);
	        this.scanned = source["scanned"];
	        this.skipped = source["skipped"];
	        this.limited = source["limited"];
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}
