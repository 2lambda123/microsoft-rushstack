// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import * as semver from 'semver';
import type * as child_process from 'child_process';
import colors from 'colors/safe';
import {
  ConsoleTerminalProvider,
  Executable,
  FileSystem,
  Import,
  InternalError,
  JsonFile,
  JsonObject,
  Terminal
} from '@rushstack/node-core-library';

import { RushConfiguration } from '../api/RushConfiguration';
import type * as inquirerTypes from 'inquirer';
import { Autoinstaller } from './Autoinstaller';
import { VersionMismatchFinderProject } from './versionMismatch/VersionMismatchFinderProject';
import { DependencyType, PackageJsonEditor } from '../api/PackageJsonEditor';
const inquirer: typeof inquirerTypes = Import.lazy('inquirer', require);

export interface IUpgradeRushSelfOptions {
  rushConfiguration: RushConfiguration;
  isDebug: boolean;
}

export interface IUpgradeResult {
  needRushUpdate: boolean;
}

export class UpgradeRushSelf {
  private readonly _rushConfiguration: RushConfiguration;
  private readonly _terminal: Terminal;
  private readonly _isDebug: boolean = false;

  public constructor(options: IUpgradeRushSelfOptions) {
    this._rushConfiguration = options.rushConfiguration;
    this._isDebug = options.isDebug;
    this._terminal = new Terminal(
      new ConsoleTerminalProvider({
        verboseEnabled: options.isDebug
      })
    );
  }

  public getAvaiableRushVersions(): string[] {
    this._terminal.writeLine('Fetching rush versions');

    const { versions }: { versions: string[] } = this._npmView('@microsoft/rush');
    if (!Array.isArray(versions)) {
      throw new Error('Unable to retrieve @microsoft/rush versions');
    }

    return versions;
  }

  public async upgradeAsync(): Promise<IUpgradeResult> {
    const versions: string[] = this.getAvaiableRushVersions();

    const promptModule: inquirerTypes.PromptModule = inquirer.createPromptModule();
    const { version } = await promptModule({
      type: 'list',
      name: 'version',
      message: `Select the version to update the repo to use`,
      choices: versions.sort((a, b) => semver.rcompare(a, b))
    });

    // update rush.json
    const rushJsonFile: string = this._rushConfiguration.rushJsonFile;
    const json: JsonObject = await JsonFile.loadAsync(rushJsonFile);
    if (json.rushVersion === version) {
      console.log();
      console.log(colors.yellow(`Rush version "${version}" is the version that is already used in this repository.`));
      return {
        needRushUpdate: false
      };
    }
    json.rushVersion = version;
    await JsonFile.saveAsync(json, rushJsonFile, { updateExistingFile: true, onlyIfChanged: true });
    if (this._isDebug) {
      console.log(colors.gray(`upgrade rushVersion in rush.json to ${version}`));
    }

    const dependencies: Record<string, string> = this._npmView(`@microsoft/rush@${version}`, 'dependencies');
    const targetPackageNames: string[] = Object.keys(dependencies).filter(
      (k) => k.startsWith('@microsoft/') || k.startsWith('@rushstack/')
    );
    let needRushUpdate: boolean = false;
    if (targetPackageNames.length) {
      const targetPackages: Record<string, string> = {};
      for (const packageName of targetPackageNames) {
        targetPackages[packageName] = dependencies[packageName];
      }

      for (const project of this._rushConfiguration.projects) {
        const versionMismatchFinderProject: VersionMismatchFinderProject = new VersionMismatchFinderProject(
          project
        );
        for (const [k, v] of Object.entries(targetPackages)) {
          versionMismatchFinderProject.updateDependencyOnlyExists(k, v, DependencyType.Regular);
          versionMismatchFinderProject.updateDependencyOnlyExists(k, v, DependencyType.Dev);
        }

        const saved: boolean = versionMismatchFinderProject.saveIfModified();
        if (saved) {
          if (this._isDebug) {
            console.log(colors.gray(`${project.packageName} package.json changed`));
          }
          needRushUpdate = true;
        }
      }

      // autoinstallers
      const autoinstallerNames: string[] = FileSystem.readFolder(
        this._rushConfiguration.commonAutoinstallersFolder
      );
      for (const autoinstallerName of autoinstallerNames) {
        const autoinstaller: Autoinstaller = new Autoinstaller(autoinstallerName, this._rushConfiguration);
        const packageJsonFile: string = autoinstaller.packageJsonPath;
        const packageJsonEditor: PackageJsonEditor = PackageJsonEditor.load(packageJsonFile);
        for (const [k, v] of Object.entries(targetPackages)) {
          packageJsonEditor.updateDependencyOnlyExists(k, v, DependencyType.Regular);
          packageJsonEditor.updateDependencyOnlyExists(k, v, DependencyType.Dev);
        }

        const saved: boolean = packageJsonEditor.saveIfModified();

        if (saved) {
          autoinstaller.update();
          if (this._isDebug) {
            console.log(colors.gray(`autoinstaller ${autoinstallerName} updated`));
          }
        }
      }
    }

    return {
      needRushUpdate
    };
  }

  private _npmView(packageIdentifier: string, key?: string): JsonObject {
    const npmArgs: string[] = ['view', '--json', packageIdentifier];
    if (key) {
      npmArgs.push(key);
    }
    const result: child_process.SpawnSyncReturns<string> = Executable.spawnSync('npm', npmArgs, {
      currentWorkingDirectory: this._rushConfiguration.commonRushConfigFolder,
      stdio: ['ignore', 'pipe', 'pipe'],
      // Wait at most 10 seconds for "npm view" to succeed
      timeoutMs: 10 * 1000
    });
    this._terminal.writeLine();
    // (This is not exactly correct, for example Node.js puts a string in error.errno instead of a string.)
    const error: (Error & Partial<NodeJS.ErrnoException>) | undefined = result.error;

    if (error) {
      if (error.code === 'ETIMEDOUT') {
        // For example, an incorrect "https-proxy" setting can hang for a long time
        throw new Error('The "npm view" command timed out; check your .npmrc file for an incorrect setting');
      }

      throw new Error('Error invoking "npm view": ' + result.error);
    }

    // NPM 6.x writes to stdout
    let jsonContent: string | undefined = UpgradeRushSelf._tryFindJson(result.stdout);
    if (jsonContent === undefined) {
      // NPM 7.x writes dirty output to stderr; see https://github.com/npm/cli/issues/2740
      jsonContent = UpgradeRushSelf._tryFindJson(result.stderr);
    }
    if (jsonContent === undefined) {
      throw new InternalError('The "npm view" command did not return a JSON structure');
    }

    let jsonOutput: JsonObject;
    try {
      jsonOutput = JSON.parse(jsonContent);
    } catch (error) {
      this._terminal.writeVerboseLine('NPM response:\n\n--------\n' + jsonContent + '\n--------\n\n');
      throw new InternalError('The "npm view" command returned an invalid JSON structure');
    }
    const errorCode: JsonObject = jsonOutput?.error?.code;
    if (errorCode) {
      this._terminal.writeVerboseLine('NPM response:\n' + JSON.stringify(jsonOutput, undefined, 2) + '\n\n');
      throw new Error(`The "npm view" command returned an error code "${errorCode}"`);
    }

    return jsonOutput;
  }

  /**
   * This is a workaround for https://github.com/npm/cli/issues/2740 where the NPM tool sometimes
   * mixes together JSON and terminal messages in a single STDERR stream.
   *
   * @remarks
   * Given an input like this:
   * ```
   * npm ERR! 404 Note that you can also install from a
   * npm ERR! 404 tarball, folder, http url, or git url.
   * {
   *   "error": {
   *     "code": "E404",
   *     "summary": "Not Found - GET https://registry.npmjs.org/@rushstack%2fnonexistent-package - Not found"
   *   }
   * }
   * npm ERR! A complete log of this run can be found in:
   * ```
   *
   * @returns the JSON section, or `undefined` if a JSON object could not be detected
   */
  private static _tryFindJson(dirtyOutput: string): string | undefined {
    const lines: string[] = dirtyOutput.split(/\r?\n/g);
    let startIndex: number | undefined;
    let endIndex: number | undefined;

    // Find the first line that starts with "{"
    for (let i: number = 0; i < lines.length; ++i) {
      const line: string = lines[i];
      if (/^\s*\{/.test(line)) {
        startIndex = i;
        break;
      }
    }
    if (startIndex === undefined) {
      return undefined;
    }

    // Find the last line that ends with "}"
    for (let i: number = lines.length - 1; i >= startIndex; --i) {
      const line: string = lines[i];
      if (/\}\s*$/.test(line)) {
        endIndex = i;
        break;
      }
    }

    if (endIndex === undefined) {
      return undefined;
    }

    return lines.slice(startIndex, endIndex + 1).join('\n');
  }
}
