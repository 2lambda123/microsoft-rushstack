// @public
export declare function addSuppression(suppression: string | RegExp): void;

// @public
class ApiExtractorTask extends GulpTask<IApiExtractorTaskConfig> {
  // (undocumented)
  executeTask(gulp: typeof Gulp, completeCallback: (error?: string) => void): NodeJS.ReadWriteStream | void;
  // (undocumented)
  loadSchema(): Object;
  // (undocumented)
  name: string;
  // (undocumented)
  taskConfig: IApiExtractorTaskConfig;
}

// @public
class CleanFlagTask extends CleanTask {
  constructor();
  // (undocumented)
  executeTask(gulp: typeof Gulp, completeCallback: (error?: string | Error) => void): void;
  // (undocumented)
  isEnabled(buildConfig: IBuildConfig): boolean;
}

// @public
class CleanTask extends GulpTask<void> {
  constructor();
  executeTask(gulp: typeof Gulp, completeCallback: (error?: string | Error) => void): void;
}

// @public
class CopyTask extends GulpTask<ICopyConfig> {
  constructor();
  executeTask(gulp: typeof Gulp, completeCallback: (error?: string | Error) => void): Promise<Object> | NodeJS.ReadWriteStream | void;
  loadSchema(): Object;
}

// @public
export declare function coverageData(coverage: number, threshold: number, filePath: string): void;

// @public
export declare function error(...args: Array<string | Chalk.ChalkChain>): void;

// @public
export declare function fileError(taskName: string, filePath: string, line: number, column: number, errorCode: string, message: string): void;

// @public
export declare function fileLog(write: (text: string) => void, taskName: string, filePath: string, line: number, column: number, errorCode: string, message: string): void;

// @public
export declare function fileWarning(taskName: string, filePath: string, line: number, column: number, errorCode: string, message: string): void;

// @public
export declare function functionalTestRun(name: string, result: TestResultState, duration: number): void;

// @public
class GenerateShrinkwrapTask extends GulpTask<void> {
  constructor();
  executeTask(gulp: gulpType.Gulp, completeCallback: (error?: string | Error) => void): NodeJS.ReadWriteStream | void;
}

// @public
export declare function getConfig(): IBuildConfig;

// @public
export declare function getErrors(): string[];

// @public
export declare function getWarnings(): string[];

// @public
class GulpTask<TASK_CONFIG> implements IExecutable {
  protected _getConfigFilePath(): string;
  buildConfig: IBuildConfig;
  cleanMatch: string[];
  copyFile(localSourcePath: string, localDestPath?: string): void;
  enabled: boolean;
  execute(config: IBuildConfig): Promise<void>;
  abstract executeTask(gulp: gulp.Gulp | GulpProxy, completeCallback?: (error?: string | Error) => void): Promise<Object> | NodeJS.ReadWriteStream | void;
  fileError(filePath: string, line: number, column: number, errorCode: string, message: string): void;
  fileExists(localPath: string): boolean;
  fileWarning(filePath: string, line: number, column: number, warningCode: string, message: string): void;
  getCleanMatch(buildConfig: IBuildConfig, taskConfig?: TASK_CONFIG): string[];
  isEnabled(buildConfig: IBuildConfig): boolean;
  protected loadSchema(): Object | undefined;
  log(message: string): void;
  logError(message: string): void;
  logVerbose(message: string): void;
  logWarning(message: string): void;
  mergeConfig(taskConfig: TASK_CONFIG): void;
  name: string;
  onRegister(): void;
  readJSONSync(localPath: string): Object | undefined;
  replaceConfig(taskConfig: TASK_CONFIG): void;
  resolvePath(localPath: string): string;
  schema: Object | undefined;
  setConfig(taskConfig: TASK_CONFIG): void;
  taskConfig: TASK_CONFIG;
}

// @public (undocumented)
interface IBuildConfig {
  args: {
    [ name: string ]: string | boolean;
  }
  buildErrorIconPath?: string;
  buildSuccessIconPath?: string;
  distFolder: string;
  gulp: GulpProxy | gulp.Gulp;
  isRedundantBuild?: boolean;
  libAMDFolder?: string;
  libES6Folder?: string;
  libFolder: string;
  onTaskEnd?: (taskName: string, duration: number[], error?: any) => void;
  onTaskStart?: (taskName: string) => void;
  packageFolder: string;
  production: boolean;
  properties?: {
    [ key: string ]: any;
  }
  relogIssues?: boolean;
  rootPath: string;
  shouldWarningsFailBuild?: boolean;
  showToast?: boolean;
  srcFolder: string;
  tempFolder: string;
  uniqueTasks?: IExecutable[];
  verbose: boolean;
}

// @public
interface ICopyConfig {
  copyTo: {
    [ destPath: string ]: string[];
  }
  shouldFlatten?: boolean;
}

// @public
interface ICustomGulpTask {
  // (undocumented)
  (gulp: typeof Gulp | GulpProxy, buildConfig: IBuildConfig, done?: (failure?: Object) => void): Promise<Object> | NodeJS.ReadWriteStream | void;
}

// @public (undocumented)
interface IExecutable {
  execute: (config: IBuildConfig) => Promise<void>;
  getCleanMatch?: (config: IBuildConfig, taskConfig?: any) => string[];
  isEnabled?: (buildConfig: IBuildConfig) => boolean;
  name?: string;
  onRegister?: () => void;
}

// @public
export declare function initialize(gulp: typeof Gulp): void;

// @public (undocumented)
interface ITsConfigFile<T> {
  // (undocumented)
  compilerOptions: T;
}

// @public (undocumented)
interface IWebpackTaskConfig {
  config?: Webpack.Configuration;
  configPath: string;
  suppressWarnings?: (string | RegExp)[];
  webpack?: typeof Webpack;
}

// @public
export declare function log(...args: Array<string | Chalk.ChalkChain>): void;

// @public
export declare function logSummary(value: string): void;

// @public
export declare function mergeConfig(config: Partial<IBuildConfig>): void;

// @public
export declare function parallel(...tasks: Array<IExecutable[] | IExecutable>): IExecutable;

// @public
export declare function replaceConfig(config: IBuildConfig): void;

// @public
export declare function reset(): void;

// @public
class SchemaValidator {
  static readAndValidateJson < TResult >(dataFilePath: string, schemaFilePath: string): TResult;
  // (undocumented)
  static readCommentedJsonFile < TResult >(filename: string): TResult;
  static validate(data: Object, schema: Object, dataFilePath?: string): void;
}

// @public
export declare function serial(...tasks: Array<IExecutable[] | IExecutable>): IExecutable;

// @public
export declare function setConfig(config: Partial<IBuildConfig>): void;

// @public
export declare function subTask(taskName: string, fn: ICustomGulpTask): IExecutable;

// @public
export declare function task(taskName: string, taskExecutable: IExecutable): IExecutable;

// @public
enum TestResultState {
  // (undocumented)
  Failed = 1,
  // (undocumented)
  FlakyFailed = 2,
  // (undocumented)
  Passed = 0,
  // (undocumented)
  Skipped = 3
}

// @public
class TypeScriptConfiguration {
  static getGulpTypescriptOptions(buildConfig: IBuildConfig): ITsConfigFile<ts.Settings>;
  static getTsConfigFile(config: IBuildConfig): ITsConfigFile<ts.Settings>;
  static getTypescriptCompiler(): any;
  static setTypescriptCompiler(typescriptOverride: any): void;
}

// @public (undocumented)
class TypeScriptTask extends GulpTask<ITypeScriptTaskConfig> {
  // (undocumented)
  executeTask(gulp: gulpType.Gulp, completeCallback: (error?: string) => void): void;
  // (undocumented)
  getCleanMatch(buildConfig: IBuildConfig, taskConfig?: ITypeScriptTaskConfig): string[];
  // (undocumented)
  loadSchema(): Object;
  mergeConfig(config: ITypeScriptTaskConfig): void;
  // (undocumented)
  name: string;
  // (undocumented)
  taskConfig: ITypeScriptTaskConfig;
}

// @public
class ValidateShrinkwrapTask extends GulpTask<void> {
  constructor();
  executeTask(gulp: gulpType.Gulp, completeCallback: (error: string) => void): NodeJS.ReadWriteStream | void;
}

// @public
export declare function verbose(...args: Array<string | Chalk.ChalkChain>): void;

// @public
export declare function warn(...args: Array<string | Chalk.ChalkChain>): void;

// @public
export declare function watch(watchMatch: string | string[], taskExecutable: IExecutable): IExecutable;

// @public (undocumented)
class WebpackTask extends GulpTask<IWebpackTaskConfig> {
  // (undocumented)
  executeTask(gulp: typeof Gulp, completeCallback: (error?: string) => void): void;
  // (undocumented)
  isEnabled(buildConfig: IBuildConfig): boolean;
  // (undocumented)
  loadSchema(): Object;
  // (undocumented)
  name: string;
  // (undocumented)
  resources: Object;
  // (undocumented)
  taskConfig: IWebpackTaskConfig;
}

// WARNING: Unsupported export: preCopy
// WARNING: Unsupported export: postCopy
// WARNING: Unsupported export: compileTsTasks
// WARNING: Unsupported export: buildTasks
// WARNING: Unsupported export: bundleTasks
// WARNING: Unsupported export: testTasks
// WARNING: Unsupported export: defaultTasks
// WARNING: Unsupported export: postProcessSourceMapsTask
// WARNING: Unsupported export: validateShrinkwrapTask
// WARNING: Unsupported export: generateShrinkwrapTask
// WARNING: Unsupported export: cleanFlag
// WARNING: Unsupported export: clean
// WARNING: Unsupported export: apiExtractor
// WARNING: Unsupported export: typescript
// WARNING: Unsupported export: tslint
// WARNING: Unsupported export: text
// WARNING: Unsupported export: removeTripleSlash
// WARNING: Unsupported export: sass
// WARNING: Unsupported export: karma
// WARNING: Unsupported export: webpack
// WARNING: Unsupported export: serve
// WARNING: Unsupported export: reload
// WARNING: Unsupported export: trustDevCert
// WARNING: Unsupported export: untrustDevCert
// (No packageDescription for this package)
