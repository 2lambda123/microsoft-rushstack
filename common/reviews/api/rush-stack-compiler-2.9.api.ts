// @beta
declare class ApiExtractorRunner extends RushStackCompilerBase {
    // (undocumented)
    constructor(extractorConfig: IExtractorConfig, extractorOptions: IExtractorOptions, rootPath: string, terminalProvider: ITerminalProvider);
    // (undocumented)
    static apiExtractor: typeof ApiExtractor;
    // (undocumented)
    invoke(): Promise<void>;
}

// @public (undocumented)
interface ITslintRunnerConfig {
    displayAsError?: boolean;
    // (undocumented)
    fileError: WriteFileIssueFunction;
    // (undocumented)
    fileWarning: WriteFileIssueFunction;
}

// @beta (undocumented)
interface ITypescriptCompilerOptions {
    customArgs?: string[];
}

// @beta (undocumented)
declare abstract class RushStackCompilerBase<TOptions = {}> {
    // (undocumented)
    constructor(taskOptions: TOptions, rootPath: string, terminalProvider: ITerminalProvider);
    // (undocumented)
    protected _standardBuildFolders: StandardBuildFolders;
    // (undocumented)
    protected _taskOptions: TOptions;
    // (undocumented)
    protected _terminal: Terminal;
}

// @alpha (undocumented)
declare class ToolPackages {
    // (undocumented)
    static apiExtractor: typeof ApiExtractor;
    // (undocumented)
    static tslint: typeof Tslint;
    // (undocumented)
    static typescript: typeof Typescript;
}

// @beta (undocumented)
declare class ToolPaths {
    // (undocumented)
    static readonly tslintPackageJson: IPackageJson;
    // (undocumented)
    static readonly tslintPackagePath: string;
    // (undocumented)
    static readonly typescriptPackageJson: IPackageJson;
    // (undocumented)
    static readonly typescriptPackagePath: string;
    }

// @beta (undocumented)
declare class TslintRunner extends RushStackCompilerBase<ITslintRunnerConfig> {
    // (undocumented)
    constructor(taskOptions: ITslintRunnerConfig, rootPath: string, terminalProvider: ITerminalProvider);
    // (undocumented)
    invoke(): Promise<void>;
}

// @beta (undocumented)
declare class TypescriptCompiler extends RushStackCompilerBase<ITypescriptCompilerOptions> {
    // (undocumented)
    constructor(rootPath: string, terminalProvider: ITerminalProvider);
    // (undocumented)
    constructor(taskOptions: ITypescriptCompilerOptions, rootPath: string, terminalProvider: ITerminalProvider);
    // (undocumented)
    invoke(): Promise<void>;
}

// @beta (undocumented)
declare type WriteFileIssueFunction = (filePath: string, line: number, column: number, errorCode: string, message: string) => void;

